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

const bg1Path = path.resolve(readArg("--background1", path.join(ROOT, "assets", "overlays", "background_1_corn_wheat_green_clear.png")));
const bg2Path = path.resolve(readArg("--background2", path.join(ROOT, "assets", "overlays", "background_2_corn_raindrop_nutrients.png")));
const audio1Path = path.resolve(readArg("--audio1", path.join(ROOT, "work", "audio", "nur2_scene1_voiceover_openai_shimmer_slow_fixed.wav")));
const audio2Path = path.resolve(readArg("--audio2", path.join(ROOT, "work", "audio", "nur2_scene2_voiceover_openai_shimmer_fixed.wav")));
const outDir = path.resolve(readArg("--out-dir", path.join(ROOT, "renders", "drafts")));
const stem = readArg("--stem", "nur2_scene1_scene2_shimmer");
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const scene2StartSeconds = Number(readArg("--scene2-start", "20.5"));

for (const filePath of [bg1Path, bg2Path, audio1Path, audio2Path]) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing render input: ${filePath}`);
}

fs.mkdirSync(outDir, { recursive: true });

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

function pageHtml() {
  const config = {
    width: 1920,
    height: 1080,
    fps: 30,
    scene2StartSeconds,
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NuR2 Two Background Render</title>
  <style>
    html, body { margin: 0; background: #07120b; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
<canvas id="stage" width="${config.width}" height="${config.height}"></canvas>
<audio id="voice1" preload="auto" src="/audio1.wav"></audio>
<audio id="voice2" preload="auto" src="/audio2.wav"></audio>
<script>
(() => {
  const CONFIG = ${JSON.stringify(config)};
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = CONFIG.width;
  const H = CONFIG.height;
  const SCENE2 = CONFIG.scene2StartSeconds;
  const voice1 = document.getElementById("voice1");
  const voice2 = document.getElementById("voice2");
  const bg1 = new Image();
  const bg2 = new Image();
  bg1.src = "/background1.png";
  bg2.src = "/background2.png";

  let runtimeDuration = 48;

  const nutrients = [
    { symbol: "N", name: "Nitrogen", color: "#2fd7ff", x: 0.23, y: 0.31, r: 60, delay: 0.7 },
    { symbol: "P", name: "Phosphorus", color: "#ffc247", x: 0.40, y: 0.26, r: 56, delay: 1.2 },
    { symbol: "K", name: "Potassium", color: "#d783ff", x: 0.58, y: 0.30, r: 54, delay: 1.7 },
    { symbol: "Ca", name: "Calcium", color: "#a8f45f", x: 0.72, y: 0.35, r: 46, delay: 2.1 },
    { symbol: "Mg", name: "Magnesium", color: "#57f3bd", x: 0.50, y: 0.42, r: 44, delay: 2.4 }
  ];

  const soilDots = Array.from({ length: 64 }, (_, i) => ({
    x: (0.08 + ((i * 31) % 84) / 100) * W,
    y: (0.63 + ((i * 17) % 24) / 100) * H,
    color: nutrients[i % nutrients.length].color,
    offset: (i * 0.173) % 1,
    size: 4 + (i % 5),
    speed: 0.55 + (i % 7) * 0.08
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

  function drawCoverImage(image, progress, alpha = 1, panScale = 1) {
    const baseScale = Math.max(W / image.width, H / image.height);
    const zoom = baseScale * (1.02 + 0.035 * progress);
    const drawW = image.width * zoom;
    const drawH = image.height * zoom;
    const panX = lerp(-24, 18, progress) * panScale;
    const panY = lerp(-4, -20, progress) * panScale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, (W - drawW) / 2 + panX, (H - drawH) / 2 + panY, drawW, drawH);
    ctx.restore();
  }

  function drawGrade(intensity = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(4, 35, 41, " + 0.10 * intensity + ")");
    g.addColorStop(0.40, "rgba(255, 255, 255, 0)");
    g.addColorStop(0.73, "rgba(2, 20, 8, " + 0.08 * intensity + ")");
    g.addColorStop(1, "rgba(2, 18, 7, " + 0.44 * intensity + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawVividPolish(t, centerX, centerY) {
    const pulse = (Math.sin(t * 1.6) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.09 + pulse * 0.03;
    const g = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, W * 0.46);
    g.addColorStop(0, "rgba(142, 255, 94, 0.78)");
    g.addColorStop(0.55, "rgba(55, 220, 130, 0.22)");
    g.addColorStop(1, "rgba(55, 220, 130, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawOrb(item, index, t) {
    const appear = smoothstep(item.delay, item.delay + 1.1, t);
    const fade = 1 - smoothstep(13.2, 17.8, t) * 0.38;
    const lossMove = smoothstep(10.2, 17.0, t);
    if (appear <= 0) return;

    const bob = Math.sin(t * 1.2 + index * 1.7) * 13;
    const startX = item.x * W + Math.sin(t * 0.5 + index) * 10;
    const startY = item.y * H + bob;
    const endX = W * (0.35 + index * 0.11);
    const endY = H * (0.76 + (index % 2) * 0.04);
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

  function drawScene1(t) {
    const progress = clamp(t / SCENE2, 0, 1);
    drawCoverImage(bg1, progress);
    drawGrade(1);
    drawVividPolish(t, W * 0.43, H * 0.48);
    nutrients.forEach((item, index) => drawOrb(item, index, t));

    const titleAlpha = Math.max(1 - smoothstep(4.3, 5.4, t), smoothstep(16.2, 18.0, t));
    if (titleAlpha > 0) {
      drawCenteredTitle("The Nutrient Paradox", t < 12 ? "Every harvest begins with nutrients" : "A nutrient that lost its way", titleAlpha);
    }
    drawBottomCaption(scene1Caption(t), smoothstep(0.15, 0.65, t) * (1 - smoothstep(SCENE2 - 0.7, SCENE2 - 0.15, t)));
  }

  function scene1Caption(t) {
    if (t < 5.8) return "Every harvest begins with nutrients.";
    if (t < 10.9) return "Nitrogen and phosphorus feed the world.";
    if (t < 15.8) return "But millions never make it into our food.";
    return "This is the story of a nutrient that lost its way.";
  }

  function drawScene2(localT, globalT) {
    const progress = clamp(localT / Math.max(voice2.duration + 0.5, 26.5), 0, 1);
    drawCoverImage(bg2, progress, 1, 0.6);
    drawGrade(0.85);
    drawVividPolish(globalT, W * 0.28, H * 0.62);
    drawScene2NutrientFlow(localT);
    drawScene2Title(localT);
    drawBottomCaption(scene2Caption(localT), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(runtimeDuration - SCENE2 - 0.8, runtimeDuration - SCENE2 - 0.15, localT)));
  }

  function scene2Caption(t) {
    if (t < 7.8) return "It starts with a single drop of rain, falling on a freshly fertilized field.";
    if (t < 18.2) return "As water moves across the land, it picks up nitrogen and phosphorus meant for the crops...";
    return "...and carries them past the edge of the field, into a ditch, a stream, a river.";
  }

  function drawScene2Title(t) {
    const alpha = smoothstep(0.2, 1.3, t) * (1 - smoothstep(7.4, 9.2, t));
    if (alpha <= 0) return;
    drawCenteredTitle("Follow One Raindrop", "nutrients begin moving with water", alpha);
  }

  function drawScene2NutrientFlow(t) {
    const alpha = smoothstep(1.0, 2.8, t);
    if (alpha <= 0) return;

    for (const dot of soilDots) {
      const flow = smoothstep(8.0, 21.5, t);
      const wiggle = Math.sin(t * 3 + dot.offset * 20) * 7;
      const x = lerp(dot.x, W * (0.62 + dot.offset * 0.30), flow) + wiggle;
      const y = lerp(dot.y, H * (0.72 + dot.offset * 0.12), flow) + Math.cos(t * 2 + dot.offset * 12) * 6;
      const pulse = 0.68 + 0.32 * Math.sin(t * 4 + dot.offset * 18);
      ctx.save();
      ctx.globalAlpha = alpha * pulse * 0.72;
      ctx.shadowColor = rgba(dot.color, 0.72);
      ctx.shadowBlur = 16;
      ctx.fillStyle = rgba(dot.color, 0.88);
      ctx.beginPath();
      ctx.arc(x, y, dot.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const lineAlpha = smoothstep(8.2, 10.6, t);
    if (lineAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = lineAlpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const channels = [
        { color: "#2fd7ff", width: 12, y: 0.72, phase: 0 },
        { color: "#ffc247", width: 8, y: 0.76, phase: 90 },
        { color: "#57f3bd", width: 6, y: 0.80, phase: 160 }
      ];
      for (const channel of channels) {
        ctx.beginPath();
        ctx.moveTo(W * 0.43, H * channel.y);
        ctx.bezierCurveTo(W * 0.54, H * (channel.y + 0.02), W * 0.68, H * (channel.y + 0.08), W * 0.88, H * (channel.y + 0.03));
        ctx.strokeStyle = rgba(channel.color, 0.56);
        ctx.lineWidth = channel.width;
        ctx.shadowColor = rgba(channel.color, 0.56);
        ctx.shadowBlur = 18;
        ctx.setLineDash([38, 28]);
        ctx.lineDashOffset = -(t * 85 + channel.phase);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      drawArrow(W * 0.64, H * 0.72, W * 0.82, H * 0.76);
      ctx.restore();
    }
  }

  function drawArrow(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 20;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 5;
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

  function drawCenteredTitle(title, subtitle, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.60)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.font = "800 86px Segoe UI, Arial, sans-serif";
    ctx.fillText(title, W / 2, H * 0.18);
    ctx.font = "600 34px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(226, 255, 217, 0.94)";
    ctx.fillText(subtitle, W / 2, H * 0.27);
    ctx.restore();
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

  function drawBottomCaption(text, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const bottomGradient = ctx.createLinearGradient(0, H * 0.69, 0, H);
    bottomGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    bottomGradient.addColorStop(1, "rgba(0, 0, 0, 0.62)");
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, H * 0.66, W, H * 0.34);
    const font = "600 40px Segoe UI, Arial, sans-serif";
    const lines = wrapText(text, W * 0.80, font);
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.74)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    const startY = H * 0.885 - (lines.length - 1) * 27;
    lines.forEach((line, index) => ctx.fillText(line, W / 2, startY + index * 54));
    ctx.restore();
  }

  function draw(t) {
    const transition = smoothstep(SCENE2 - 0.7, SCENE2 + 0.7, t);
    if (transition <= 0) {
      drawScene1(t);
      return;
    }
    if (transition >= 1) {
      drawScene2(t - SCENE2, t);
      return;
    }

    drawScene1(t);
    ctx.save();
    ctx.globalAlpha = easeOutCubic(transition);
    drawScene2(t - SCENE2, t);
    ctx.restore();
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function recorderStopped(recorder, chunks) {
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    });
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
    await Promise.all([waitForImage(bg1), waitForImage(bg2), waitForAudio(voice1), waitForAudio(voice2)]);
    runtimeDuration = SCENE2 + voice2.duration + 0.85;

    const videoStream = canvas.captureStream(CONFIG.fps);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const destination = audioContext.createMediaStreamDestination();
    for (const voice of [voice1, voice2]) {
      const source = audioContext.createMediaElementSource(voice);
      source.connect(destination);
      source.connect(audioContext.destination);
    }

    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const mimeType = candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
    const options = { videoBitsPerSecond: 7600000, audioBitsPerSecond: 128000 };
    if (mimeType) options.mimeType = mimeType;

    const chunks = [];
    const recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => postLog("Recorder error: " + event.error);
    const stopped = recorderStopped(recorder, chunks);

    const startTime = performance.now();
    function animate() {
      const t = Math.min((performance.now() - startTime) / 1000, runtimeDuration);
      draw(t);
      if (t < runtimeDuration) requestAnimationFrame(animate);
    }

    draw(0);
    await audioContext.resume();
    recorder.start(1000);
    voice1.currentTime = 0;
    voice2.currentTime = 0;
    await voice1.play();
    setTimeout(() => {
      voice2.currentTime = 0;
      voice2.play().catch((error) => postLog(error && error.stack ? error.stack : String(error)));
    }, SCENE2 * 1000);
    requestAnimationFrame(animate);
    await sleep(runtimeDuration * 1000);
    recorder.stop();

    const videoBlob = await stopped;
    draw(SCENE2 + 8);
    const posterBlob = await canvasPngBlob();
    const posterResult = await uploadBlob("/poster", posterBlob, { "Content-Type": "image/png" });
    const videoResult = await uploadBlob("/save", videoBlob, {
      "Content-Type": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Render-Mime": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Duration": String(runtimeDuration),
      "X-Audio1-Duration": String(voice1.duration || 0),
      "X-Audio2-Duration": String(voice2.duration || 0)
    });

    document.body.innerHTML = "<pre>" + JSON.stringify({ posterResult, videoResult }, null, 2) + "</pre>";
  }

  window.onerror = (message, source, lineno, colno, error) => {
    postLog(String(message) + " at " + lineno + ":" + colno + "\\n" + (error && error.stack ? error.stack : ""));
  };

  main().catch((error) => postLog(error && error.stack ? error.stack : String(error)));
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
    if (req.method === "GET" && url.pathname === "/background1.png") {
      streamFile(res, bg1Path);
      return;
    }
    if (req.method === "GET" && url.pathname === "/background2.png") {
      streamFile(res, bg2Path);
      return;
    }
    if (req.method === "GET" && url.pathname === "/audio1.wav") {
      streamFile(res, audio1Path);
      return;
    }
    if (req.method === "GET" && url.pathname === "/audio2.wav") {
      streamFile(res, audio2Path);
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
      const outputPath = uniquePath(outDir, stem, ".webm");
      const metaPath = outputPath.replace(".webm", ".json");
      const metadata = {
        outputPath,
        mime: req.headers["x-render-mime"] || req.headers["content-type"] || "video/webm",
        bytes: body.length,
        durationSeconds: Number(req.headers["x-duration"] || "0"),
        scene2StartSeconds,
        audio1DurationSeconds: Number(req.headers["x-audio1-duration"] || "0"),
        audio2DurationSeconds: Number(req.headers["x-audio2-duration"] || "0"),
        background1Path: bg1Path,
        background2Path: bg2Path,
        audio1Path,
        audio2Path,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(outputPath, body);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      const result = { outputPath, metaPath, bytes: body.length, mime: metadata.mime };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      resolveSaved(result);
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
    rejectSaved(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error && error.stack ? error.stack : String(error));
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  const profileDir = path.join(ROOT, "work", `chrome-render-profile-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=Translate,BackForwardCache",
    `--user-data-dir=${profileDir}`,
    url
  ], {
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
  }, 90000);

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
