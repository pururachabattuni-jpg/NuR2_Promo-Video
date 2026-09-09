const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

function uniquePath(dir, stem, ext) {
  let candidate = path.join(dir, `${stem}${ext}`);
  let version = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-v${version}${ext}`);
    version += 1;
  }
  return candidate;
}

const backgroundPath = path.resolve(
  readArg("--background", path.join(ROOT, "assets", "overlays", "background_1_corn_wheat_green_clear.png"))
);
const audioPath = path.resolve(
  readArg("--audio", path.join(ROOT, "work", "audio", "nur2_scene1_voiceover.wav"))
);
const outDir = path.resolve(readArg("--out-dir", path.join(ROOT, "renders", "drafts")));
const stem = readArg("--stem", "nur2_nutrient_paradox_20s");
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const durationSeconds = Number(readArg("--duration", "20"));
const format = readArg("--format", "webm").toLowerCase();

if (!fs.existsSync(backgroundPath)) {
  throw new Error(`Missing background image: ${backgroundPath}`);
}

if (!fs.existsSync(audioPath)) {
  throw new Error(`Missing voiceover audio: ${audioPath}`);
}

fs.mkdirSync(outDir, { recursive: true });

const state = {
  saved: false,
  result: null,
};

let resolveSaved;
let rejectSaved;
const savedPromise = new Promise((resolve, reject) => {
  resolveSaved = resolve;
  rejectSaved = reject;
});

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function streamFile(res, filePath) {
  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Content-Length": fs.statSync(filePath).size,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function extensionForMime(mime) {
  return mime && mime.includes("mp4") ? ".mp4" : ".webm";
}

function pageHtml() {
  const config = {
    durationSeconds,
    format,
    width: 1920,
    height: 1080,
    fps: 30,
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NuR2 Nutrient Paradox Render</title>
  <style>
    html, body { margin: 0; background: #041208; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
<canvas id="stage" width="${config.width}" height="${config.height}"></canvas>
<audio id="voice" preload="auto" src="/voiceover.wav"></audio>
<script>
(() => {
  const CONFIG = ${JSON.stringify(config)};
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = CONFIG.width;
  const H = CONFIG.height;
  const DURATION = CONFIG.durationSeconds;
  const voice = document.getElementById("voice");
  const bg = new Image();
  bg.src = "/background.png";

  const nutrients = [
    { symbol: "N", name: "Nitrogen", color: "#2fd7ff", x: 0.23, y: 0.31, r: 60, delay: 0.7 },
    { symbol: "P", name: "Phosphorus", color: "#ffc247", x: 0.40, y: 0.26, r: 56, delay: 1.2 },
    { symbol: "K", name: "Potassium", color: "#d783ff", x: 0.58, y: 0.30, r: 54, delay: 1.7 },
    { symbol: "Ca", name: "Calcium", color: "#a8f45f", x: 0.72, y: 0.35, r: 46, delay: 2.1 },
    { symbol: "Mg", name: "Magnesium", color: "#57f3bd", x: 0.50, y: 0.42, r: 44, delay: 2.4 }
  ];

  const nutrientDots = Array.from({ length: 55 }, (_, i) => ({
    x: (0.18 + ((i * 37) % 68) / 100) * W,
    y: (0.50 + ((i * 19) % 32) / 100) * H,
    color: nutrients[i % nutrients.length].color,
    offset: (i * 0.137) % 1,
    size: 4 + (i % 4),
    speed: 0.55 + (i % 7) * 0.07
  }));

  function postLog(message) {
    fetch("/log", { method: "POST", body: String(message) }).catch(() => {});
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(edge0, edge1, value) {
    const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * (3 - 2 * x);
  }

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")";
  }

  function drawCoverImage(t) {
    const progress = t / DURATION;
    const baseScale = Math.max(W / bg.width, H / bg.height);
    const zoom = baseScale * (1.025 + 0.025 * progress);
    const drawW = bg.width * zoom;
    const drawH = bg.height * zoom;
    const panX = lerp(-22, 18, progress);
    const panY = lerp(-6, -18, progress);
    ctx.drawImage(bg, (W - drawW) / 2 + panX, (H - drawH) / 2 + panY, drawW, drawH);

    let sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "rgba(4, 35, 41, 0.10)");
    sky.addColorStop(0.40, "rgba(255, 255, 255, 0)");
    sky.addColorStop(0.74, "rgba(2, 20, 8, 0.10)");
    sky.addColorStop(1, "rgba(2, 18, 7, 0.42)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  function drawRootGlow(t) {
    const alpha = smoothstep(2.5, 5.4, t) * (1 - smoothstep(15.5, 19.0, t) * 0.35);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    for (let i = 0; i < 18; i++) {
      const x = (0.13 + i * 0.041) * W;
      const y = H * (0.71 + (i % 4) * 0.018);
      const sway = Math.sin(t * 0.9 + i) * 12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 24 + sway, y + 52, x - 18, y + 88, x + 42 + sway * 0.5, y + 135);
      ctx.strokeStyle = "rgba(174, 255, 100, 0.18)";
      ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(124, 255, 94, 0.55)";
      ctx.shadowBlur = 16;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNutrientDot(dot, t, alphaScale) {
    const driftPhase = (t * dot.speed + dot.offset) % 1;
    const startX = dot.x + Math.sin(dot.offset * 20 + t * 0.7) * 24;
    const startY = dot.y + Math.cos(dot.offset * 12 + t * 0.9) * 16;
    const wash = smoothstep(9.2, 15.2, t);
    const x = lerp(startX, W * (0.55 + dot.offset * 0.33), wash);
    const y = lerp(startY, H * (0.67 + dot.offset * 0.22), wash);
    const pulse = 0.72 + 0.28 * Math.sin(t * 4 + dot.offset * 18);

    ctx.save();
    ctx.globalAlpha = alphaScale * pulse;
    ctx.shadowColor = rgba(dot.color, 0.75);
    ctx.shadowBlur = 18;
    ctx.fillStyle = rgba(dot.color, 0.88);
    ctx.beginPath();
    ctx.arc(x + driftPhase * 16, y, dot.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSmallParticles(t) {
    const alpha = smoothstep(3.0, 5.0, t);
    if (alpha <= 0) return;
    for (const dot of nutrientDots) {
      drawNutrientDot(dot, t, alpha);
    }
  }

  function drawOrb(item, index, t) {
    const appear = smoothstep(item.delay, item.delay + 1.1, t);
    const fade = 1 - smoothstep(12.2, 16.0, t) * 0.45;
    const lossMove = smoothstep(9.4, 16.2, t);
    if (appear <= 0) return;

    const bob = Math.sin(t * 1.2 + index * 1.7) * 13;
    const startX = item.x * W + Math.sin(t * 0.5 + index) * 10;
    const startY = item.y * H + bob;
    const endX = W * (0.36 + index * 0.105);
    const endY = H * (0.75 + (index % 2) * 0.045);
    const x = lerp(startX, endX, lossMove);
    const y = lerp(startY, endY, lossMove);
    const radius = item.r * (0.92 + Math.sin(t * 1.8 + index) * 0.035);
    const alpha = appear * fade;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = rgba(item.color, 0.78);
    ctx.shadowBlur = 34;

    const grad = ctx.createRadialGradient(x - radius * 0.28, y - radius * 0.34, radius * 0.1, x, y, radius);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    grad.addColorStop(0.2, rgba(item.color, 0.94));
    grad.addColorStop(0.72, rgba(item.color, 0.62));
    grad.addColorStop(1, rgba(item.color, 0.05));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.70)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(4, 22, 18, 0.84)";
    ctx.font = "700 " + (item.symbol.length === 1 ? 62 : 50) + "px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.symbol, x, y - 4);

    const labelAlpha = smoothstep(3.5, 5.1, t) * (1 - smoothstep(10.4, 12.6, t));
    if (labelAlpha > 0) {
      ctx.globalAlpha = alpha * labelAlpha;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "600 25px Segoe UI, Arial, sans-serif";
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 10;
      ctx.fillText(item.name, x, y + radius + 34);
    }
    ctx.restore();
  }

  function drawNutrientOrbs(t) {
    nutrients.forEach((item, index) => drawOrb(item, index, t));
  }

  function drawRunoff(t) {
    const alpha = smoothstep(9.5, 11.5, t) * (1 - smoothstep(18.0, 20.0, t) * 0.25);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const paths = [
      { y: 0.69, color: "#49d4ff", width: 12, phase: 0.00 },
      { y: 0.74, color: "#2fd7ff", width: 8, phase: 0.18 },
      { y: 0.79, color: "#57f3bd", width: 6, phase: 0.34 }
    ];

    for (const p of paths) {
      ctx.beginPath();
      const startX = W * 0.42;
      const startY = H * p.y;
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(W * 0.52, startY + 18, W * 0.64, H * (p.y + 0.07), W * 0.82, H * (p.y + 0.045));
      ctx.strokeStyle = rgba(p.color, 0.58);
      ctx.lineWidth = p.width;
      ctx.shadowColor = rgba(p.color, 0.62);
      ctx.shadowBlur = 18;
      ctx.setLineDash([36, 26]);
      ctx.lineDashOffset = -(t * 80 + p.phase * 200);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const arrowAlpha = smoothstep(11.8, 13.8, t);
    ctx.globalAlpha = alpha * arrowAlpha;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 5;
    drawArrow(W * 0.62, H * 0.70, W * 0.77, H * 0.75);

    ctx.restore();
  }

  function drawArrow(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 18;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function drawTitle(t) {
    const introAlpha = 1 - smoothstep(4.3, 5.4, t);
    const finalAlpha = smoothstep(15.9, 17.4, t);
    const alpha = Math.max(introAlpha, finalAlpha);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.58)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.font = "800 88px Segoe UI, Arial, sans-serif";
    ctx.fillText("The Nutrient Paradox", W / 2, H * 0.18);

    ctx.font = "600 34px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(226, 255, 217, 0.94)";
    const subtitle = t < 12 ? "Every harvest begins with nutrients" : "A nutrient that lost its way";
    ctx.fillText(subtitle, W / 2, H * 0.27);
    ctx.restore();
  }

  function captionFor(t) {
    if (t < 5.8) return "Every harvest begins with nutrients.";
    if (t < 10.9) return "Nitrogen and phosphorus feed the world.";
    if (t < 15.8) return "But millions never make it into our food.";
    return "This is the story of a nutrient that lost its way.";
  }

  function wrapText(text, maxWidth, font) {
    ctx.font = font;
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawCaption(t) {
    const text = captionFor(t);
    const transition = Math.min(
      smoothstep(0.15, 0.65, t),
      1 - smoothstep(19.45, 19.9, t)
    );
    ctx.save();
    ctx.globalAlpha = transition;
    const bottomGradient = ctx.createLinearGradient(0, H * 0.72, 0, H);
    bottomGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    bottomGradient.addColorStop(1, "rgba(0, 0, 0, 0.58)");
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, H * 0.68, W, H * 0.32);

    const font = "600 42px Segoe UI, Arial, sans-serif";
    const lines = wrapText(text, W * 0.78, font);
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    const startY = H * 0.885 - (lines.length - 1) * 28;
    lines.forEach((line, index) => ctx.fillText(line, W / 2, startY + index * 56));
    ctx.restore();
  }

  function drawLossLabel(t) {
    const alpha = smoothstep(11.0, 12.3, t) * (1 - smoothstep(15.6, 17.0, t));
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.52)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "700 42px Segoe UI, Arial, sans-serif";
    ctx.fillText("nutrients drift away", W * 0.69, H * 0.61);
    ctx.font = "600 25px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(210, 255, 236, 0.92)";
    ctx.fillText("instead of reaching food", W * 0.69, H * 0.66);
    ctx.restore();
  }

  function drawVividPolish(t) {
    const pulse = (Math.sin(t * 1.6) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.12 + pulse * 0.035;
    const g = ctx.createRadialGradient(W * 0.43, H * 0.48, 0, W * 0.43, H * 0.48, W * 0.52);
    g.addColorStop(0, "rgba(142, 255, 94, 0.85)");
    g.addColorStop(0.52, "rgba(55, 220, 130, 0.28)");
    g.addColorStop(1, "rgba(55, 220, 130, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function draw(t) {
    drawCoverImage(t);
    drawVividPolish(t);
    drawRootGlow(t);
    drawSmallParticles(t);
    drawRunoff(t);
    drawNutrientOrbs(t);
    drawLossLabel(t);
    drawTitle(t);
    drawCaption(t);
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth) return Promise.resolve();
    return new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  }

  function waitForAudio(audio) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      audio.onloadedmetadata = resolve;
      audio.onerror = reject;
    });
  }

  function recorderStopped(recorder, chunks) {
    return new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      };
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function canvasPngBlob() {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function uploadBlob(path, blob, headers = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers,
      body: await blob.arrayBuffer()
    });
    if (!response.ok) throw new Error("Upload failed: " + response.status);
    return response.json();
  }

  async function main() {
    await waitForImage(bg);
    await waitForAudio(voice);

    const videoStream = canvas.captureStream(CONFIG.fps);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaElementSource(voice);
    const audioDestination = audioContext.createMediaStreamDestination();
    source.connect(audioDestination);
    source.connect(audioContext.destination);

    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks()
    ]);

    const webmCandidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const mp4Candidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4"
    ];
    const candidates = CONFIG.format === "mp4"
      ? [...mp4Candidates, ...webmCandidates]
      : [...webmCandidates, ...mp4Candidates];
    const mimeType = candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
    const options = {
      videoBitsPerSecond: 7200000,
      audioBitsPerSecond: 128000
    };
    if (mimeType) options.mimeType = mimeType;

    const chunks = [];
    const recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      postLog("Recorder error: " + event.error);
    };

    const stopped = recorderStopped(recorder, chunks);
    const startTime = performance.now();
    function animate() {
      const t = Math.min((performance.now() - startTime) / 1000, DURATION);
      draw(t);
      if (t < DURATION) requestAnimationFrame(animate);
    }

    draw(0);
    await audioContext.resume();
    recorder.start(1000);
    voice.currentTime = 0;
    await voice.play();
    requestAnimationFrame(animate);
    await sleep(DURATION * 1000);
    recorder.stop();

    const videoBlob = await stopped;
    draw(8.0);
    const posterBlob = await canvasPngBlob();
    const posterResult = await uploadBlob("/poster", posterBlob, { "Content-Type": "image/png" });
    const videoResult = await uploadBlob("/save", videoBlob, {
      "Content-Type": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Render-Mime": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Audio-Duration": String(voice.duration || 0)
    });

    document.body.innerHTML = "<pre>" + JSON.stringify({ posterResult, videoResult }, null, 2) + "</pre>";
  }

  window.onerror = (message, source, lineno, colno, error) => {
    postLog(String(message) + " at " + lineno + ":" + colno + "\\n" + (error && error.stack ? error.stack : ""));
  };

  main().catch((error) => {
    postLog(error && error.stack ? error.stack : String(error));
  });
})();
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(pageHtml());
      return;
    }

    if (req.method === "GET" && url.pathname === "/background.png") {
      streamFile(res, backgroundPath);
      return;
    }

    if (req.method === "GET" && url.pathname === "/voiceover.wav") {
      streamFile(res, audioPath);
      return;
    }

    if (req.method === "POST" && url.pathname === "/poster") {
      const body = await collectRequestBody(req);
      const posterPath = uniquePath(outDir, `${stem}_poster`, ".png");
      fs.writeFileSync(posterPath, body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ posterPath, bytes: body.length }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/save") {
      const body = await collectRequestBody(req);
      const mime = req.headers["x-render-mime"] || req.headers["content-type"] || "video/webm";
      const ext = extensionForMime(String(mime));
      const outputPath = uniquePath(outDir, stem, ext);
      const metaPath = outputPath.replace(ext, ".json");
      const metadata = {
        outputPath,
        posterStem: `${stem}_poster`,
        mime,
        bytes: body.length,
        durationSeconds,
        audioDurationSeconds: Number(req.headers["x-audio-duration"] || "0"),
        backgroundPath,
        audioPath,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(outputPath, body);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      state.saved = true;
      state.result = { outputPath, metaPath, bytes: body.length, mime };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state.result));
      resolveSaved(state.result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/log") {
      const body = await collectRequestBody(req);
      process.stderr.write(`[browser] ${body.toString()}\\n`);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error && error.stack ? error.stack : String(error));
    rejectSaved(error);
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  const profileDir = path.join(ROOT, "work", `chrome-render-profile-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const args = [
    "--headless=new",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=Translate,BackForwardCache",
    "--enable-features=MediaRecorderEnableMp4Muxer",
    `--user-data-dir=${profileDir}`,
    url
  ];

  const chrome = spawn(chromePath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  chrome.stdout.on("data", (data) => process.stdout.write(data));
  chrome.stderr.on("data", (data) => process.stderr.write(data));
  chrome.on("error", rejectSaved);

  const timeout = setTimeout(() => {
    rejectSaved(new Error("Timed out waiting for browser render output."));
    try {
      chrome.kill();
    } catch (_) {}
  }, Math.max(45000, (durationSeconds + 25) * 1000));

  savedPromise
    .then((result) => {
      clearTimeout(timeout);
      console.log(JSON.stringify(result, null, 2));
      try {
        chrome.kill();
      } catch (_) {}
      server.close();
    })
    .catch((error) => {
      clearTimeout(timeout);
      console.error(error && error.stack ? error.stack : String(error));
      try {
        chrome.kill();
      } catch (_) {}
      server.close(() => process.exitCode = 1);
    });
});
