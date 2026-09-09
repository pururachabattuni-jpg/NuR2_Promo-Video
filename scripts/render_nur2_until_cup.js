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

const outDir = path.resolve(readArg("--out-dir", path.join(ROOT, "renders", "drafts")));
const stem = readArg("--stem", "nur2_until_dark_cup_shimmer");
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");

const imageInputs = {
  bg1: path.join(ROOT, "assets", "overlays", "scene_01_nutrient_paradox_corn_wheat_field.png"),
  bg2: path.join(ROOT, "assets", "overlays", "scene_02_corn_raindrop_nutrients.png"),
  stream: path.join(ROOT, "assets", "generated", "scene_02_field_to_stream_runoff.png"),
  algae: path.join(ROOT, "assets", "generated", "scene_03_downstream_algae_cascade.png"),
  dead: path.join(ROOT, "assets", "original_frames", "scene_03_dead_zone_original_frame.png"),
  punjab: path.join(ROOT, "assets", "generated", "scene_04_punjab_rice_field.png"),
  valley: path.join(ROOT, "assets", "generated", "scene_05_central_valley_aerial.png"),
  cup: path.join(ROOT, "assets", "original_frames", "scene_06_dark_contamination_cup_original_frame.png"),
  half: path.join(ROOT, "assets", "original_frames", "scene_07_half_system_original_frame.png"),
  logo: path.join(ROOT, "assets", "generated", "scene_09_nur2_logo_source_full_scene.png"),
  finalBadge: path.join(ROOT, "assets", "generated", "scene_10_final_end_card_nur2_logo_badge.png"),
  future: path.join(ROOT, "assets", "original_frames", "scene_10_final_aerial_future_end_card.png")
};

const audioInputs = {
  scene1: path.join(ROOT, "work", "audio", "nur2_scene1_voiceover_openai_shimmer_slow_fixed.wav"),
  scene2: path.join(ROOT, "work", "audio", "nur2_scene2_voiceover_openai_shimmer_fixed.wav"),
  scene3: path.join(ROOT, "work", "audio", "nur2_scene3_voiceover_openai_shimmer_fixed.wav"),
  scene4: path.join(ROOT, "work", "audio", "nur2_scene4_punjab_voiceover_openai_shimmer_fixed.wav"),
  scene5: path.join(ROOT, "work", "audio", "nur2_scene5_central_valley_voiceover_openai_shimmer_fixed.wav"),
  scene6: path.join(ROOT, "work", "audio", "nur2_scene6_cup_voiceover_openai_shimmer_fixed.wav"),
  scene7: path.join(ROOT, "work", "audio", "nur2_scene7_half_system_voiceover_openai_shimmer_fixed.wav"),
  scene8: path.join(ROOT, "work", "audio", "nur2_scene8_capture_recover_return_voiceover_openai_shimmer_fixed.wav"),
  scene9: path.join(ROOT, "work", "audio", "nur2_scene9_nur2_voiceover_openai_shimmer_fixed.wav"),
  scene10: path.join(ROOT, "work", "audio", "nur2_scene10_future_voiceover_openai_shimmer_fixed.wav")
};

for (const filePath of [...Object.values(imageInputs), ...Object.values(audioInputs)]) {
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

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start < stat.size && end >= start) {
        res.writeHead(206, {
          "Content-Type": contentTypeFor(filePath),
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store"
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store"
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
    images: Object.keys(imageInputs),
    audios: Object.keys(audioInputs)
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NuR2 Through Cup Render</title>
  <style>
    html, body { margin: 0; background: #07120b; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
<canvas id="stage" width="${config.width}" height="${config.height}"></canvas>
<script>
(() => {
  const CONFIG = ${JSON.stringify(config)};
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = CONFIG.width;
  const H = CONFIG.height;
  const TRANSITION = 0.95;
  const images = {};
  const audio = {};

  for (const key of CONFIG.images) {
    const image = new Image();
    image.src = "/images/" + key + ".png";
    images[key] = image;
  }

  for (const key of CONFIG.audios) {
    const element = new Audio("/audio/" + key + ".wav");
    element.preload = "auto";
    audio[key] = element;
  }

  const nutrientPalette = [
    { symbol: "N", name: "Nitrogen", color: "#2fd7ff" },
    { symbol: "P", name: "Phosphorus", color: "#ffc247" },
    { symbol: "K", name: "Potassium", color: "#d783ff" },
    { symbol: "Ca", name: "Calcium", color: "#a8f45f" },
    { symbol: "Mg", name: "Magnesium", color: "#57f3bd" }
  ];

  const nutrientOrbs = [
    { symbol: "N", name: "Nitrogen", color: "#2fd7ff", x: 0.23, y: 0.31, r: 60, delay: 0.7 },
    { symbol: "P", name: "Phosphorus", color: "#ffc247", x: 0.40, y: 0.26, r: 56, delay: 1.2 },
    { symbol: "K", name: "Potassium", color: "#d783ff", x: 0.58, y: 0.30, r: 54, delay: 1.7 },
    { symbol: "Ca", name: "Calcium", color: "#a8f45f", x: 0.72, y: 0.35, r: 46, delay: 2.1 },
    { symbol: "Mg", name: "Magnesium", color: "#57f3bd", x: 0.50, y: 0.42, r: 44, delay: 2.4 }
  ];

  const flowDots = Array.from({ length: 90 }, (_, i) => ({
    x: (0.08 + ((i * 31) % 84) / 100) * W,
    y: (0.59 + ((i * 17) % 30) / 100) * H,
    color: nutrientPalette[i % nutrientPalette.length].color,
    offset: (i * 0.173) % 1,
    size: 4 + (i % 5),
    speed: 0.55 + (i % 7) * 0.08
  }));

  const algaeSpecks = Array.from({ length: 120 }, (_, i) => ({
    x: ((i * 47) % 100) / 100,
    y: ((i * 23) % 100) / 100,
    r: 3 + (i % 8),
    phase: i * 0.37
  }));

  const contaminantDots = Array.from({ length: 70 }, (_, i) => ({
    x: 0.52 + (((i * 29) % 44) / 100),
    y: 0.36 + (((i * 43) % 50) / 100),
    phase: i * 0.29,
    r: 4 + (i % 5)
  }));

  const scenes = [
    { key: "scene1", title: "The Nutrient Paradox", subtitle: "Every harvest begins with nutrients", audio: audio.scene1, draw: drawScene1 },
    { key: "scene2", title: "Follow One Raindrop", subtitle: "water carries nutrients past the field edge", audio: audio.scene2, draw: drawScene2 },
    { key: "scene3", title: "The Downstream Cascade", subtitle: "runoff feeds algae blooms and dead zones", audio: audio.scene3, draw: drawScene3 },
    { key: "scene4", title: "It Goes Deeper", subtitle: "Punjab, India rice field", audio: audio.scene4, draw: drawScene4 },
    { key: "scene5", title: "It Goes Deeper", subtitle: "Central Valley, California", audio: audio.scene5, draw: drawScene5 },
    { key: "scene6", title: "Dark Contamination", subtitle: "once it reaches the source", audio: audio.scene6, draw: drawScene6 },
    { key: "scene7", title: "We Built Half the System", subtitle: "downstream treatment, upstream opportunity", audio: audio.scene7, draw: drawScene7 },
    { key: "scene8", title: "Capture - Recover - Return", subtitle: "keep nutrients on the landscape", audio: audio.scene8, draw: drawScene8 },
    { key: "scene9", title: "NuR2", subtitle: "Nutrient Recovery Resilience", audio: audio.scene9, draw: drawScene9 },
    { key: "scene10", title: "A Future Worth Building", subtitle: "cleaner water, resilient farms, healthier watersheds", audio: audio.scene10, draw: drawScene10 }
  ];

  let runtimeDuration = 120;

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

  function drawCoverImage(image, progress, alpha = 1, options = {}) {
    const crop = options.crop || { sx: 0, sy: 0, sw: 1, sh: 1 };
    const sx = image.width * crop.sx;
    const sy = image.height * crop.sy;
    const sw = image.width * crop.sw;
    const sh = image.height * crop.sh;
    const baseScale = Math.max(W / sw, H / sh);
    const zoom = baseScale * (options.zoom || (1.02 + 0.035 * progress));
    const drawW = sw * zoom;
    const drawH = sh * zoom;
    const panX = lerp(options.panX0 || -24, options.panX1 || 18, progress) * (options.panScale || 1);
    const panY = lerp(options.panY0 || -4, options.panY1 || -20, progress) * (options.panScale || 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, sx, sy, sw, sh, (W - drawW) / 2 + panX, (H - drawH) / 2 + panY, drawW, drawH);
    ctx.restore();
  }

  function drawGrade(intensity = 1, cool = false) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cool ? "rgba(2, 23, 35, " + 0.20 * intensity + ")" : "rgba(4, 35, 41, " + 0.12 * intensity + ")");
    g.addColorStop(0.40, "rgba(255, 255, 255, 0)");
    g.addColorStop(0.73, "rgba(2, 20, 8, " + 0.10 * intensity + ")");
    g.addColorStop(1, "rgba(2, 14, 7, " + 0.48 * intensity + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawVividPolish(t, centerX, centerY, alpha = 0.10) {
    const pulse = (Math.sin(t * 1.6) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = alpha + pulse * 0.025;
    const g = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, W * 0.46);
    g.addColorStop(0, "rgba(142, 255, 94, 0.78)");
    g.addColorStop(0.55, "rgba(55, 220, 130, 0.20)");
    g.addColorStop(1, "rgba(55, 220, 130, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawTitle(title, subtitle, alpha, y = 0.17) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.66)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.font = "800 80px Segoe UI, Arial, sans-serif";
    ctx.fillText(title, W / 2, H * y);
    ctx.font = "600 32px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(226, 255, 217, 0.94)";
    ctx.fillText(subtitle, W / 2, H * (y + 0.085));
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

  function drawBottomCaption(text, alpha, options = {}) {
    if (alpha <= 0 || !text) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const bottomGradient = ctx.createLinearGradient(0, H * 0.68, 0, H);
    bottomGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    bottomGradient.addColorStop(1, "rgba(0, 0, 0, 0.68)");
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, H * 0.63, W, H * 0.37);
    const size = options.size || 39;
    const font = "650 " + size + "px Segoe UI, Arial, sans-serif";
    const lines = wrapText(text, options.maxWidth || W * 0.81, font).slice(0, 3);
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.78)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    const lineHeight = size * 1.33;
    const startY = H * (options.y || 0.875) - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, index) => ctx.fillText(line, W / 2, startY + index * lineHeight));
    ctx.restore();
  }

  function drawArrow(x1, y1, x2, y2, color = "rgba(255,255,255,0.82)", width = 5) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 22;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
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
    ctx.restore();
  }

  function drawOrb(item, index, t, sceneDuration) {
    const appear = smoothstep(item.delay, item.delay + 1.1, t);
    const lossMove = smoothstep(sceneDuration * 0.54, sceneDuration * 0.88, t);
    if (appear <= 0) return;
    const bob = Math.sin(t * 1.2 + index * 1.7) * 13;
    const startX = item.x * W + Math.sin(t * 0.5 + index) * 10;
    const startY = item.y * H + bob;
    const endX = W * (0.34 + index * 0.11);
    const endY = H * (0.75 + (index % 2) * 0.04);
    const x = lerp(startX, endX, lossMove);
    const y = lerp(startY, endY, lossMove);
    const radius = item.r * (0.92 + Math.sin(t * 1.8 + index) * 0.035);
    const alpha = appear * (1 - smoothstep(sceneDuration - 1.5, sceneDuration, t) * 0.8);

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
    const labelAlpha = smoothstep(3.4, 5.0, t) * (1 - smoothstep(sceneDuration * 0.48, sceneDuration * 0.58, t));
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

  function drawScene1(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    drawCoverImage(images.bg1, progress, 1, { panScale: 0.65 });
    drawGrade(1);
    drawVividPolish(localT, W * 0.43, H * 0.48, 0.09);
    nutrientOrbs.forEach((item, index) => drawOrb(item, index, localT, scene.duration));

    const titleAlpha = Math.max(1 - smoothstep(4.3, 5.4, localT), smoothstep(scene.duration - 4.0, scene.duration - 2.0, localT));
    drawTitle("The Nutrient Paradox", localT < 12 ? "Every harvest begins with nutrients" : "A nutrient that lost its way", titleAlpha);
    drawBottomCaption(scene1Caption(localT, scene.duration), smoothstep(0.15, 0.65, localT) * (1 - smoothstep(scene.duration - 0.7, scene.duration - 0.15, localT)));
  }

  function scene1Caption(t, duration) {
    if (t < duration * 0.30) return "Every harvest begins with nutrients.";
    if (t < duration * 0.55) return "Nitrogen and phosphorus feed the world.";
    if (t < duration * 0.80) return "But millions never make it into our food.";
    return "This is the story of a nutrient that lost its way.";
  }

  function drawScene2(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    const streamAlpha = smoothstep(scene.duration - 8.5, scene.duration - 4.0, localT);
    drawCoverImage(images.bg2, progress, 1, { panScale: 0.55, zoom: 1.05 + progress * 0.025 });
    drawCoverImage(images.stream, progress, streamAlpha, { panScale: 0.25, zoom: 1.02 + progress * 0.035, panX0: 18, panX1: -12, panY0: 0, panY1: -16 });
    drawGrade(0.84);
    drawVividPolish(localT, W * 0.30, H * 0.62, 0.07);
    drawScene2NutrientFlow(localT, scene.duration, streamAlpha);
    drawTitle("Follow One Raindrop", "water carries nutrients past the field edge", smoothstep(0.2, 1.3, localT) * (1 - smoothstep(7.2, 9.0, localT)));
    drawBottomCaption(scene2Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)));
  }

  function scene2Caption(t, duration) {
    if (t < duration * 0.30) return "It starts with a single drop of rain, falling on a freshly fertilized field.";
    if (t < duration * 0.68) return "Water picks up nitrogen and phosphorus meant for the crops.";
    return "Then it carries them past the field edge, into a ditch, a stream, a river.";
  }

  function drawScene2NutrientFlow(t, duration, streamAlpha) {
    const alpha = smoothstep(1.0, 2.8, t);
    if (alpha <= 0) return;
    for (const dot of flowDots) {
      const flow = smoothstep(duration * 0.28, duration * 0.90, t);
      const wiggle = Math.sin(t * 3 + dot.offset * 20) * 7;
      const x = lerp(dot.x, W * (0.56 + dot.offset * 0.36), flow) + wiggle;
      const y = lerp(dot.y, H * (0.67 + dot.offset * 0.18), flow) + Math.cos(t * 2 + dot.offset * 12) * 6;
      const pulse = 0.68 + 0.32 * Math.sin(t * 4 + dot.offset * 18);
      ctx.save();
      ctx.globalAlpha = alpha * pulse * (0.62 + streamAlpha * 0.28);
      ctx.shadowColor = rgba(dot.color, 0.72);
      ctx.shadowBlur = 16;
      ctx.fillStyle = rgba(dot.color, 0.88);
      ctx.beginPath();
      ctx.arc(x, y, dot.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const lineAlpha = smoothstep(duration * 0.30, duration * 0.42, t);
    if (lineAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = lineAlpha * (0.9 - streamAlpha * 0.12);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const channels = [
        { color: "#2fd7ff", width: 12, y: 0.70, phase: 0 },
        { color: "#ffc247", width: 8, y: 0.74, phase: 90 },
        { color: "#57f3bd", width: 6, y: 0.78, phase: 160 }
      ];
      for (const channel of channels) {
        ctx.beginPath();
        ctx.moveTo(W * 0.35, H * channel.y);
        ctx.bezierCurveTo(W * 0.50, H * (channel.y + 0.02), W * 0.68, H * (channel.y + 0.08), W * 0.90, H * (channel.y + 0.03));
        ctx.strokeStyle = rgba(channel.color, 0.58);
        ctx.lineWidth = channel.width;
        ctx.shadowColor = rgba(channel.color, 0.54);
        ctx.shadowBlur = 18;
        ctx.setLineDash([38, 28]);
        ctx.lineDashOffset = -(t * 85 + channel.phase);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      drawArrow(W * 0.62, H * 0.70, W * 0.82, H * 0.75);
      ctx.restore();
    }

    if (streamAlpha > 0.05) {
      ctx.save();
      ctx.globalAlpha = streamAlpha * 0.8;
      for (let i = 0; i < 7; i += 1) {
        const y = H * (0.48 + i * 0.055);
        ctx.strokeStyle = i % 2 ? "rgba(47, 215, 255, 0.42)" : "rgba(255, 194, 71, 0.36)";
        ctx.lineWidth = i % 2 ? 8 : 5;
        ctx.lineCap = "round";
        ctx.setLineDash([52, 38]);
        ctx.lineDashOffset = -t * (80 + i * 8);
        ctx.beginPath();
        ctx.moveTo(W * 0.12, y + Math.sin(t + i) * 8);
        ctx.bezierCurveTo(W * 0.35, y + 16, W * 0.60, y - 24, W * 0.92, y + 10);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function drawScene3(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    const deadAlpha = smoothstep(scene.duration * 0.58, scene.duration * 0.82, localT);
    drawCoverImage(images.algae, progress, 1, { panScale: 0.45, zoom: 1.05 + progress * 0.035 });
    drawCoverImage(images.dead, progress, deadAlpha, {
      crop: { sx: 0, sy: 0.23, sw: 1, sh: 0.54 },
      zoom: 1.06 + progress * 0.05,
      panScale: 0.2,
      panY0: 4,
      panY1: -8
    });
    drawGrade(1.05, true);
    drawAlgaeBloom(localT, scene.duration, deadAlpha);
    drawTitle("The Downstream Cascade", "runoff feeds algae blooms and dead zones", smoothstep(0.2, 1.4, localT) * (1 - smoothstep(6.0, 8.0, localT)));
    drawBottomCaption(scene3Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 38 });
  }

  function scene3Caption(t, duration) {
    if (t < duration * 0.27) return "Downstream, these nutrients feed something else: algae.";
    if (t < duration * 0.64) return "Blooms block sunlight and consume the oxygen below.";
    return "The result: dead zones where aquatic life cannot survive.";
  }

  function drawAlgaeBloom(t, duration, deadAlpha) {
    const bloom = smoothstep(2.0, duration * 0.60, t);
    ctx.save();
    for (const speck of algaeSpecks) {
      const x = (speck.x * W + Math.sin(t * 0.55 + speck.phase) * 28) % W;
      const y = speck.y * H + Math.cos(t * 0.42 + speck.phase) * 18;
      ctx.globalAlpha = bloom * (0.18 + 0.18 * Math.sin(t * 1.8 + speck.phase)) * (1 - deadAlpha * 0.15);
      ctx.fillStyle = "rgba(113, 255, 75, 0.85)";
      ctx.shadowColor = "rgba(113, 255, 75, 0.65)";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, speck.r * (1 + bloom * 0.75), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const oxygenFade = 1 - smoothstep(duration * 0.37, duration * 0.76, t);
    ctx.save();
    ctx.globalAlpha = 0.9 * oxygenFade;
    for (let i = 0; i < 9; i += 1) {
      const x = W * (0.18 + i * 0.078);
      const y = H * (0.73 - ((i * 19) % 12) / 100) - t * 6;
      ctx.strokeStyle = "rgba(204, 244, 255, 0.74)";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(47, 215, 255, 0.58)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 20 + (i % 3) * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = "700 22px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(230, 250, 255, 0.84)";
      ctx.fillText("O2", x, y);
    }
    ctx.restore();
  }

  function drawScene4(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    const diagramAlpha = smoothstep(scene.duration * 0.47, scene.duration * 0.68, localT);
    drawCoverImage(images.punjab, progress, 1, { panScale: 0.35, zoom: 1.02 + progress * 0.03, panX0: -10, panX1: 10, panY0: 0, panY1: -12 });
    drawGrade(0.86);
    drawVividPolish(localT, W * 0.36, H * 0.55, 0.06);
    drawDownwardSeep(localT, scene.duration, 1 - diagramAlpha * 0.35);
    drawPunjabWellDiagram(localT, scene.duration, diagramAlpha);
    drawTitle("It Goes Deeper", "Punjab, India rice field", smoothstep(0.2, 1.2, localT) * (1 - smoothstep(7.0, 9.0, localT)));
    drawBottomCaption(scene4Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 36 });
  }

  function scene4Caption(t, duration) {
    if (t < duration * 0.30) return "Pollution does not only flow downstream. It also seeps down.";
    if (t < duration * 0.72) return "In Punjab, intensive irrigation pushed nutrient-rich water into the ground.";
    return "Even wells more than a hundred meters deep were no longer safe.";
  }

  function drawDownwardSeep(t, duration, alpha = 1) {
    const rainAlpha = smoothstep(1.2, 4.0, t) * (1 - smoothstep(duration * 0.60, duration * 0.78, t)) * alpha;
    ctx.save();
    ctx.globalAlpha = rainAlpha;
    for (let i = 0; i < 5; i += 1) {
      const x = W * (0.18 + i * 0.15);
      const top = H * 0.36 + Math.sin(t + i) * 10;
      drawArrow(x, top, x + Math.sin(i) * 14, top + H * 0.25, "rgba(47, 151, 255, 0.72)", 7);
    }
    for (const dot of flowDots.slice(0, 46)) {
      const p = smoothstep(duration * 0.20, duration * 0.60, t);
      const x = lerp(dot.x * 0.75, W * (0.25 + dot.offset * 0.45), p);
      const y = lerp(H * 0.48, H * (0.62 + dot.offset * 0.25), p) + Math.sin(t * 4 + dot.offset * 20) * 8;
      ctx.globalAlpha = rainAlpha * 0.7;
      ctx.fillStyle = rgba(dot.color, 0.88);
      ctx.shadowColor = rgba(dot.color, 0.65);
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, dot.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPunjabWellDiagram(t, duration, alpha) {
    if (alpha <= 0) return;
    const a = alpha * (1 - smoothstep(duration - 0.6, duration, t) * 0.2);
    const x = W * 0.48;
    const y = H * 0.20;
    const w = W * 0.46;
    const h = H * 0.62;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(12, 20, 25, 0.70)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "rgba(140, 92, 48, 0.92)";
    ctx.fillRect(x, y, w, h * 0.25);
    ctx.fillStyle = "rgba(202, 172, 111, 0.92)";
    ctx.fillRect(x, y + h * 0.25, w, h * 0.34);
    ctx.fillStyle = "rgba(105, 114, 119, 0.94)";
    ctx.fillRect(x, y + h * 0.59, w, h * 0.18);
    ctx.fillStyle = "rgba(211, 184, 125, 0.94)";
    ctx.fillRect(x, y + h * 0.77, w, h * 0.23);

    const wellX = x + w * 0.22;
    ctx.fillStyle = "rgba(26, 31, 40, 0.98)";
    ctx.fillRect(wellX - 18, y - 12, 36, h * 0.92);
    ctx.fillStyle = "rgba(38, 46, 58, 0.98)";
    ctx.fillRect(wellX - 58, y - 30, 116, 52);
    ctx.strokeStyle = "rgba(220, 230, 238, 0.80)";
    ctx.lineWidth = 5;
    for (let i = 0; i < 7; i += 1) {
      const rungY = y + h * (0.66 + i * 0.035);
      ctx.beginPath();
      ctx.moveTo(wellX - 18, rungY);
      ctx.lineTo(wellX + 18, rungY);
      ctx.stroke();
    }

    const arrowAlpha = smoothstep(duration * 0.58, duration * 0.85, t);
    ctx.globalAlpha = a * arrowAlpha;
    for (let i = 0; i < 4; i += 1) {
      const ax = x + w * (0.50 + i * 0.12);
      drawArrow(ax, y + h * 0.05, ax, y + h * 0.55, "rgba(70, 166, 255, 0.78)", 9);
    }

    ctx.globalAlpha = a;
    for (const dot of contaminantDots) {
      const drift = Math.sin(t * 2 + dot.phase) * 5;
      ctx.fillStyle = "rgba(238, 64, 38, 0.88)";
      ctx.shadowColor = "rgba(238, 64, 38, 0.58)";
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(x + w * (dot.x - 0.44) + drift, y + h * (dot.y - 0.18), dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.font = "600 38px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(125, 214, 255, 0.94)";
    ctx.textAlign = "center";
    ctx.fillText("irrigation return flow", x + w * 0.70, y + h * 0.22);
    ctx.fillStyle = "rgba(255, 205, 185, 0.96)";
    ctx.fillText("arsenic  uranium  fluoride", x + w * 0.66, y + h * 0.76);
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.font = "650 36px Segoe UI, Arial, sans-serif";
    ctx.fillText("well > 100 m deep", wellX + 116, y + h * 0.89);
    ctx.restore();
  }

  function drawScene5(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    drawCoverImage(images.valley, progress, 1, { panScale: 0.55, zoom: 1.03 + progress * 0.03, panX0: -18, panX1: 16, panY0: -8, panY1: -18 });
    drawGrade(0.94);
    drawNitrateUraniumGroundwater(localT, scene.duration);
    drawMapInset(localT, scene.duration);
    drawTitle("It Goes Deeper", "Central Valley, California", smoothstep(0.2, 1.2, localT) * (1 - smoothstep(5.8, 7.5, localT)));
    drawBottomCaption(scene5Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 34, maxWidth: W * 0.84 });
  }

  function scene5Caption(t, duration) {
    if (t < duration * 0.25) return "This is not only a story from far away.";
    if (t < duration * 0.66) return "In the High Plains and California's Central Valley, nitrate has been linked to uranium in groundwater.";
    return "Millions live above aquifers affected by this chemistry.";
  }

  function drawNitrateUraniumGroundwater(t, duration) {
    const alpha = smoothstep(3.2, duration * 0.55, t);
    ctx.save();
    ctx.globalAlpha = alpha;
    const waterY = H * 0.72;
    const aquifer = ctx.createLinearGradient(0, waterY, 0, H);
    aquifer.addColorStop(0, "rgba(50, 158, 217, 0.18)");
    aquifer.addColorStop(1, "rgba(13, 73, 112, 0.34)");
    ctx.fillStyle = aquifer;
    ctx.fillRect(0, waterY, W, H - waterY);
    ctx.strokeStyle = "rgba(157, 227, 255, 0.42)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(0, waterY + Math.sin(t) * 8);
    ctx.bezierCurveTo(W * 0.30, waterY - 18, W * 0.66, waterY + 24, W, waterY - 6);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 55; i += 1) {
      const p = ((t * 0.06 + i * 0.037) % 1);
      const x = W * (0.08 + ((i * 17) % 86) / 100);
      const y = lerp(H * 0.42, H * 0.86, p);
      const isU = i % 4 === 0;
      ctx.fillStyle = isU ? "rgba(232, 63, 38, 0.88)" : "rgba(47, 215, 255, 0.86)";
      ctx.shadowColor = isU ? "rgba(232, 63, 38, 0.55)" : "rgba(47, 215, 255, 0.50)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 2 + i) * 10, y, isU ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 28px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(220, 250, 255, 0.95)";
    ctx.fillText("NO3-", W * 0.36, H * 0.61);
    ctx.fillStyle = "rgba(255, 200, 184, 0.95)";
    ctx.fillText("U", W * 0.61, H * 0.78);
    ctx.restore();
  }

  function drawMapInset(t, duration) {
    const alpha = smoothstep(4.5, 6.4, t) * (1 - smoothstep(duration - 1.1, duration, t));
    if (alpha <= 0) return;
    const x = W * 0.70;
    const y = H * 0.13;
    const w = W * 0.22;
    const h = H * 0.31;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(11, 22, 28, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.30)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.translate(x + w * 0.50, y + h * 0.50);
    ctx.scale(w * 0.70, h * 0.80);
    ctx.beginPath();
    ctx.moveTo(-0.18, -0.48);
    ctx.lineTo(0.22, -0.38);
    ctx.lineTo(0.29, -0.02);
    ctx.lineTo(0.18, 0.44);
    ctx.lineTo(-0.08, 0.50);
    ctx.lineTo(-0.24, 0.20);
    ctx.lineTo(-0.29, -0.20);
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 244, 229, 0.90)";
    ctx.fill();
    ctx.strokeStyle = "rgba(13, 42, 38, 0.66)";
    ctx.lineWidth = 0.018;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 194, 71, 0.92)";
    ctx.beginPath();
    ctx.ellipse(0.02, 0.07, 0.075, 0.33, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 0.014;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "650 25px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 10;
    ctx.fillText("Central Valley, CA", x + w / 2, y + h - 30);
    ctx.restore();
  }

  function drawScene6(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    drawCoverImage(images.cup, progress, 1, { zoom: 1.0 + progress * 0.015, panX0: 0, panX1: 0, panY0: 0, panY1: -8 });
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.06 * Math.sin(localT * 1.8);
    ctx.fillStyle = "rgba(26, 44, 55, 0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = smoothstep(0.9, 2.2, localT);
    for (let i = 0; i < 22; i += 1) {
      const x = W * (0.44 + ((i * 19) % 16) / 100) + Math.sin(localT * 2 + i) * 5;
      const y = H * (0.60 + ((i * 23) % 18) / 100) + Math.cos(localT * 2.4 + i) * 4;
      ctx.fillStyle = "rgba(238, 64, 38, 0.82)";
      ctx.shadowColor = "rgba(238, 64, 38, 0.55)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 5 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScene7(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    drawCoverImage(images.half, progress, 1, {
      crop: { sx: 0.24, sy: 0.35, sw: 0.74, sh: 0.47 },
      zoom: 1.06 + progress * 0.035,
      panScale: 0.25,
      panX0: -10,
      panX1: 14,
      panY0: -4,
      panY1: -10
    });
    drawGrade(0.88);
    drawHalfSystemOverlay(localT, scene.duration);
    drawTitle("We Built Half the System", "downstream treatment, upstream opportunity", smoothstep(0.2, 1.3, localT) * (1 - smoothstep(7.0, 9.0, localT)));
    drawBottomCaption(scene7Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 35, maxWidth: W * 0.84 });
  }

  function scene7Caption(t, duration) {
    if (t < duration * 0.34) return "For a century, we invested downstream: treatment plants, river cleanups, lake restorations.";
    if (t < duration * 0.73) return "But nutrient pollution begins upstream, across landscapes never designed for recovery.";
    return "This is not a failure of agriculture. It is an infrastructure challenge.";
  }

  function drawHalfSystemOverlay(t, duration) {
    const alpha = smoothstep(2.0, 4.2, t) * (1 - smoothstep(duration - 1.2, duration, t));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(3, 12, 16, 0.68)";
    ctx.fillRect(0, H * 0.36, W, H * 0.23);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.50, H * 0.30);
    ctx.lineTo(W * 0.50, H * 0.68);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.font = "800 49px Segoe UI, Arial, sans-serif";
    ctx.fillText("DOWNSTREAM", W * 0.25, H * 0.42);
    ctx.fillText("UPSTREAM", W * 0.75, H * 0.42);
    ctx.font = "600 32px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(226, 255, 247, 0.92)";
    ctx.fillText("treatment after pollution", W * 0.25, H * 0.49);
    ctx.fillText("recovery before runoff", W * 0.75, H * 0.49);

    drawTreatmentIcon(W * 0.23, H * 0.63, smoothstep(3.6, 6.2, t));
    drawRecoveryLoop(W * 0.74, H * 0.63, smoothstep(7.0, duration * 0.85, t));
    ctx.restore();
  }

  function drawTreatmentIcon(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "rgba(210, 222, 225, 0.92)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      const cx = x - 78 + i * 78;
      ctx.beginPath();
      ctx.ellipse(cx, y, 34, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - 34, y, 68, 74);
      ctx.fill();
      ctx.strokeRect(cx - 34, y, 68, 74);
      ctx.beginPath();
      ctx.ellipse(cx, y + 74, 34, 13, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRecoveryLoop(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = "rgba(87, 243, 189, 0.90)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(87, 243, 189, 0.50)";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(x, y + 30, 78, -0.7, Math.PI * 1.45);
    ctx.stroke();
    drawArrow(x + 6, y - 47, x + 62, y - 30, "rgba(87, 243, 189, 0.95)", 8);
    ctx.fillStyle = "rgba(255, 194, 71, 0.96)";
    for (let i = 0; i < 14; i += 1) {
      ctx.beginPath();
      ctx.arc(x - 62 + (i % 7) * 20, y + 18 + Math.floor(i / 7) * 28, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScene8(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    drawCoverImage(images.stream, progress, 1, {
      zoom: 1.04 + progress * 0.035,
      panScale: 0.22,
      panX0: 10,
      panX1: -14,
      panY0: -2,
      panY1: -15
    });
    drawGrade(0.78);
    drawFiltrationSystem(localT, scene.duration);
    drawCaptureRecoverReturnWords(localT, scene.duration);
    drawTitle("Capture - Recover - Return", "keep nutrients on the landscape", smoothstep(0.2, 1.2, localT) * (1 - smoothstep(5.4, 7.0, localT)));
    drawBottomCaption(scene8Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 35, maxWidth: W * 0.82 });
  }

  function scene8Caption(t, duration) {
    if (t < duration * 0.24) return "So, what if nutrients never reached the river?";
    if (t < duration * 0.70) return "Capture them before they leave the landscape. Recover them as a valuable resource.";
    return "Waste becomes value. Pollution becomes prevention.";
  }

  function drawCaptureRecoverReturnWords(t, duration) {
    const words = [
      { text: "CAPTURE", x: W * 0.26, at: 1.2, color: "#2fd7ff" },
      { text: "RECOVER", x: W * 0.50, at: duration * 0.34, color: "#ffc247" },
      { text: "RETURN", x: W * 0.74, at: duration * 0.58, color: "#57f3bd" }
    ];
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.62)";
    ctx.shadowBlur = 14;
    ctx.font = "800 55px Segoe UI, Arial, sans-serif";
    for (const word of words) {
      const alpha = smoothstep(word.at, word.at + 1.0, t) * (1 - smoothstep(duration - 1.0, duration, t));
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(7, 21, 20, 0.58)";
      ctx.fillRect(word.x - 170, H * 0.18, 340, 82);
      ctx.strokeStyle = rgba(word.color, 0.80);
      ctx.lineWidth = 3;
      ctx.strokeRect(word.x - 170, H * 0.18, 340, 82);
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
      ctx.fillText(word.text, word.x, H * 0.218);
    }
    ctx.restore();
  }

  function drawFiltrationSystem(t, duration) {
    const appear = smoothstep(2.2, 4.0, t);
    const filterX = W * 0.56;
    const filterY = H * 0.34;
    const filterW = W * 0.10;
    const filterH = H * 0.42;
    const recover = smoothstep(duration * 0.35, duration * 0.66, t);
    const returnFlow = smoothstep(duration * 0.58, duration * 0.90, t);

    ctx.save();
    ctx.globalAlpha = appear;

    ctx.lineCap = "round";
    for (let i = 0; i < 7; i += 1) {
      ctx.strokeStyle = i % 2 ? "rgba(47, 215, 255, 0.58)" : "rgba(255, 194, 71, 0.46)";
      ctx.lineWidth = i % 2 ? 10 : 7;
      ctx.setLineDash([54, 34]);
      ctx.lineDashOffset = -(t * (105 + i * 8));
      ctx.beginPath();
      const y = H * (0.49 + i * 0.035);
      ctx.moveTo(W * 0.08, y + Math.sin(t + i) * 7);
      ctx.bezierCurveTo(W * 0.25, y - 18, W * 0.41, y + 26, filterX - 12, y + 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const filterGrad = ctx.createLinearGradient(filterX, filterY, filterX + filterW, filterY);
    filterGrad.addColorStop(0, "rgba(15, 45, 50, 0.88)");
    filterGrad.addColorStop(0.5, "rgba(92, 210, 194, 0.76)");
    filterGrad.addColorStop(1, "rgba(9, 30, 36, 0.88)");
    ctx.fillStyle = filterGrad;
    ctx.shadowColor = "rgba(87, 243, 189, 0.50)";
    ctx.shadowBlur = 26;
    ctx.fillRect(filterX, filterY, filterW, filterH);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 4;
    ctx.strokeRect(filterX, filterY, filterW, filterH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 11; i += 1) {
      const y = filterY + i * filterH / 10;
      ctx.beginPath();
      ctx.moveTo(filterX, y);
      ctx.lineTo(filterX + filterW, y - filterH * 0.10);
      ctx.stroke();
    }

    for (let i = 0; i < 70; i += 1) {
      const palette = nutrientPalette[i % nutrientPalette.length];
      const travel = ((t * (0.055 + (i % 5) * 0.012) + i * 0.031) % 1);
      const inletX = W * 0.07;
      const inletY = H * (0.49 + ((i * 17) % 20) / 100);
      const captureX = filterX - 18 - (i % 7) * 5;
      const captureY = filterY + filterH * (0.08 + ((i * 23) % 82) / 100);
      const passedX = filterX + filterW + W * 0.06 + travel * W * 0.24;
      const willCapture = i % 5 !== 0;
      const movingT = smoothstep(0.05, 0.84, travel);
      let x;
      let y;
      if (willCapture) {
        x = lerp(inletX, captureX, movingT);
        y = lerp(inletY, captureY, movingT) + Math.sin(t * 3 + i) * 5;
      } else {
        x = travel < 0.75 ? lerp(inletX, filterX + filterW + 15, movingT) : passedX;
        y = inletY + Math.sin(t * 3 + i) * 5;
      }
      ctx.globalAlpha = appear * (willCapture ? 0.92 : 0.58);
      ctx.fillStyle = rgba(palette.color, 0.92);
      ctx.shadowColor = rgba(palette.color, 0.65);
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.arc(x, y, 5 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = appear * recover;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(16, 22, 18, 0.72)";
    ctx.fillRect(filterX - W * 0.02, filterY + filterH + 20, filterW + W * 0.04, 74);
    ctx.fillStyle = "rgba(255, 232, 169, 0.98)";
    ctx.font = "700 27px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("captured nutrients", filterX + filterW / 2, filterY + filterH + 58);

    ctx.globalAlpha = appear * returnFlow;
    ctx.strokeStyle = "rgba(87, 243, 189, 0.84)";
    ctx.lineWidth = 9;
    ctx.setLineDash([38, 22]);
    ctx.lineDashOffset = -t * 90;
    ctx.beginPath();
    ctx.moveTo(filterX + filterW / 2, filterY + filterH + 96);
    ctx.bezierCurveTo(W * 0.55, H * 0.90, W * 0.78, H * 0.84, W * 0.89, H * 0.66);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrow(W * 0.82, H * 0.70, W * 0.90, H * 0.63, "rgba(87, 243, 189, 0.92)", 7);
    drawSmallPlant(W * 0.91, H * 0.60, returnFlow);
    ctx.restore();
  }

  function drawSmallPlant(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "rgba(93, 62, 33, 0.84)";
    ctx.fillRect(x - 58, y + 72, 116, 24);
    ctx.strokeStyle = "rgba(99, 226, 117, 0.95)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + 72);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(99, 226, 117, 0.92)";
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(x + (i % 2 ? 20 : -20), y + 18 + i * 11, 29, 13, i % 2 ? -0.55 : 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScene9(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    ctx.save();
    ctx.filter = "blur(5px) saturate(1.16) brightness(0.83)";
    drawCoverImage(images.stream, progress, 1, {
      zoom: 1.05 + progress * 0.018,
      panX0: 0,
      panX1: -12,
      panY0: -8,
      panY1: -18
    });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(0, 20, 22, 0.70)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    drawCenterNur2Logo(localT, scene.duration);
    drawMissionChips(localT, scene.duration);
    drawBottomCaption(scene9Caption(localT, scene.duration), smoothstep(0.35, 1.0, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 31, maxWidth: W * 0.78, y: 0.93 });
  }

  function drawCenterNur2Logo(t, duration) {
    const alpha = smoothstep(0.35, 1.6, t) * (1 - smoothstep(duration - 0.9, duration, t));
    if (alpha <= 0) return;

    const scalePulse = 1 + Math.sin(t * 0.7) * 0.006;
    const cx = W / 2;
    const topY = H * 0.19;
    const logoH = H * 0.50;
    const bottomY = topY + logoH;
    const halfW = W * 0.145;
    const wordY = topY + logoH * 0.61;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, H * 0.47);
    ctx.scale(scalePulse, scalePulse);
    ctx.translate(-cx, -H * 0.47);

    const glow = ctx.createRadialGradient(cx, H * 0.47, 0, cx, H * 0.47, W * 0.31);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.40)");
    glow.addColorStop(0.42, "rgba(213, 255, 248, 0.16)");
    glow.addColorStop(1, "rgba(213, 255, 248, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const dropGradient = ctx.createLinearGradient(cx - halfW, topY, cx + halfW, bottomY);
    dropGradient.addColorStop(0, "rgba(0, 96, 133, 0.98)");
    dropGradient.addColorStop(0.48, "rgba(0, 139, 182, 0.98)");
    dropGradient.addColorStop(1, "rgba(58, 203, 151, 0.98)");

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(235, 255, 252, 0.16)";
    traceNuR2Drop(cx, topY, logoH, halfW);
    ctx.fill();

    ctx.shadowColor = "rgba(0, 37, 48, 0.42)";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.52)";
    ctx.lineWidth = 24;
    traceNuR2Drop(cx, topY, logoH, halfW);
    ctx.stroke();

    ctx.shadowBlur = 16;
    ctx.strokeStyle = dropGradient;
    ctx.lineWidth = 13;
    traceNuR2Drop(cx, topY, logoH, halfW);
    ctx.stroke();

    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(42, 183, 158, 0.92)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.44, topY + logoH * 0.33);
    ctx.bezierCurveTo(cx - halfW * 0.78, topY + logoH * 0.57, cx - halfW * 0.58, topY + logoH * 0.86, cx - halfW * 0.08, topY + logoH * 0.89);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 97, 132, 0.84)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, bottomY - logoH * 0.23, halfW * 0.72, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();

    ctx.shadowColor = "rgba(255, 255, 255, 0.95)";
    ctx.shadowBlur = 10;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.font = "900 152px Segoe UI, Arial, sans-serif";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(238, 255, 253, 0.92)";
    ctx.fillStyle = "rgba(0, 83, 116, 0.98)";
    ctx.strokeText("NuR", cx - 8, wordY);
    ctx.fillText("NuR", cx - 8, wordY);

    ctx.font = "900 78px Segoe UI, Arial, sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeText("2", cx + 203, wordY - 70);
    ctx.fillText("2", cx + 203, wordY - 70);

    ctx.shadowBlur = 7;
    ctx.font = "900 37px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(0, 85, 91, 0.96)";
    ctx.strokeStyle = "rgba(238, 255, 253, 0.86)";
    ctx.lineWidth = 4;
    drawArcText("WATER CLEAR SIMPLE", cx, bottomY - logoH * 0.24, halfW * 0.88, Math.PI * 0.77, Math.PI * 0.23);

    ctx.shadowBlur = 8;
    ctx.font = "800 41px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(0, 91, 103, 0.96)";
    ctx.strokeStyle = "rgba(238, 255, 253, 0.82)";
    ctx.lineWidth = 5;
    ctx.strokeText("Nutrient Recovery Resilience", cx, H * 0.84);
    ctx.fillText("Nutrient Recovery Resilience", cx, H * 0.84);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function traceNuR2Drop(cx, topY, logoH, halfW) {
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.bezierCurveTo(cx - halfW * 0.72, topY + logoH * 0.25, cx - halfW * 1.02, topY + logoH * 0.52, cx - halfW * 0.78, topY + logoH * 0.76);
    ctx.bezierCurveTo(cx - halfW * 0.43, topY + logoH * 1.05, cx + halfW * 0.43, topY + logoH * 1.05, cx + halfW * 0.78, topY + logoH * 0.76);
    ctx.bezierCurveTo(cx + halfW * 1.02, topY + logoH * 0.52, cx + halfW * 0.72, topY + logoH * 0.25, cx, topY);
  }

  function drawArcText(text, cx, cy, radius, startAngle, endAngle) {
    const chars = text.split("");
    const span = endAngle - startAngle;
    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i];
      const angle = startAngle + span * (chars.length === 1 ? 0.5 : i / (chars.length - 1));
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle - Math.PI / 2);
      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }
  }

  function scene9Caption(t, duration) {
    if (t < duration * 0.30) return "NuR2, Nutrient Recovery Resilience, is a nonprofit being formed to advance this vision.";
    if (t < duration * 0.68) return "Watershed protection, nutrient recovery, education, and partnerships.";
    return "Working with farmers, communities, and scientists, at the source, not just the symptom.";
  }

  function drawMissionChips(t, duration) {
    const alpha = smoothstep(duration * 0.30, duration * 0.45, t) * (1 - smoothstep(duration - 0.8, duration, t));
    if (alpha <= 0) return;
    const items = [
      "watershed protection",
      "nutrient recovery",
      "education",
      "partnerships"
    ];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 25px Segoe UI, Arial, sans-serif";
    for (let i = 0; i < items.length; i += 1) {
      const x = W * (0.17 + i * 0.22);
      const y = H * 0.13;
      ctx.fillStyle = "rgba(3, 17, 20, 0.54)";
      ctx.fillRect(x - 138, y - 30, 276, 60);
      ctx.strokeStyle = "rgba(151, 241, 232, 0.72)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 138, y - 30, 276, 60);
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 10;
      ctx.fillText(items[i], x, y);
    }
    ctx.restore();
  }

  function drawScene10(localT, scene) {
    const progress = clamp(localT / scene.duration, 0, 1);
    drawCoverImage(images.future, progress, 1, {
      crop: { sx: 0, sy: 0.20, sw: 1, sh: 0.58 },
      zoom: 1.04 + progress * 0.035,
      panScale: 0.30,
      panX0: -10,
      panX1: 12,
      panY0: -4,
      panY1: -12
    });
    drawGrade(0.82);
    const titleAlpha = smoothstep(0.2, 1.3, localT) * (1 - smoothstep(scene.duration - 1.5, scene.duration - 0.3, localT));
    drawTitle("A Future Worth Building", "cleaner water, resilient farms, healthier watersheds", titleAlpha);
    drawFutureWords(localT, scene.duration);
    drawBottomCaption(scene10Caption(localT, scene.duration), smoothstep(0.2, 0.8, localT) * (1 - smoothstep(scene.duration - 0.55, scene.duration - 0.05, localT)), { size: 36, maxWidth: W * 0.80 });
  }

  function scene10Caption(t, duration) {
    if (t < duration * 0.40) return "The greatest environmental successes become normal.";
    if (t < duration * 0.70) return "Cleaner water. Resilient farms. Healthier watersheds.";
    return "Join us in building that future. Learn more at nur2.org.";
  }

  function drawFutureWords(t, duration) {
    const alpha = smoothstep(duration * 0.35, duration * 0.55, t);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha * (1 - smoothstep(duration - 1.0, duration, t));
    const items = [
      { text: "Cleaner water", x: 0.25 },
      { text: "Resilient farms", x: 0.50 },
      { text: "Healthier watersheds", x: 0.75 }
    ];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "750 37px Segoe UI, Arial, sans-serif";
    for (const item of items) {
      const x = W * item.x;
      const y = H * 0.47;
      ctx.fillStyle = "rgba(2, 22, 18, 0.58)";
      ctx.fillRect(x - 180, y - 42, 360, 84);
      ctx.strokeStyle = "rgba(142, 255, 180, 0.70)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 180, y - 42, 360, 84);
      ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 12;
      ctx.fillText(item.text, x, y);
    }
    const finalAlpha = smoothstep(duration * 0.72, duration * 0.88, t);
    ctx.globalAlpha = finalAlpha;
    ctx.font = "800 82px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.shadowColor = "rgba(7, 55, 50, 0.85)";
    ctx.shadowBlur = 18;
    ctx.fillText("nur2.org", W / 2, H * 0.62);

    const badgeW = W * 0.146;
    const badgeH = badgeW * (images.finalBadge.height / images.finalBadge.width);
    const badgeX = (W - badgeW) / 2;
    const badgeY = H * 0.665;
    ctx.shadowColor = "rgba(0, 20, 18, 0.58)";
    ctx.shadowBlur = 16;
    ctx.drawImage(images.finalBadge, badgeX, badgeY, badgeW, badgeH);
    ctx.restore();
  }

  function findSceneIndex(t) {
    let index = scenes.length - 1;
    for (let i = 0; i < scenes.length; i += 1) {
      const next = scenes[i + 1];
      if (!next || t < next.start) {
        index = i;
        break;
      }
    }
    return index;
  }

  function drawSceneByIndex(index, t) {
    const scene = scenes[index];
    const localT = clamp(t - scene.start, 0, scene.duration);
    scene.draw(localT, scene, index);
  }

  function draw(t) {
    const index = findSceneIndex(t);
    const next = scenes[index + 1];
    if (next && t > next.start - TRANSITION) {
      const alpha = smoothstep(next.start - TRANSITION, next.start + TRANSITION * 0.15, t);
      drawSceneByIndex(index, t);
      ctx.save();
      ctx.globalAlpha = easeOutCubic(alpha);
      drawSceneByIndex(index + 1, Math.max(t, next.start));
      ctx.restore();
      return;
    }
    drawSceneByIndex(index, t);
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth) return Promise.resolve();
    return new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  }

  function waitForAudio(element) {
    if (Number.isFinite(element.duration) && element.duration > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      element.onloadedmetadata = resolve;
      element.onerror = reject;
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
    await Promise.all([
      ...Object.values(images).map(waitForImage),
      ...Object.values(audio).map(waitForAudio)
    ]);

    let cursor = 0;
    for (const scene of scenes) {
      scene.start = cursor;
      scene.duration = scene.audio.duration;
      cursor += scene.duration;
    }
    runtimeDuration = cursor + 0.65;

    const videoStream = canvas.captureStream(CONFIG.fps);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const destination = audioContext.createMediaStreamDestination();
    for (const scene of scenes) {
      const source = audioContext.createMediaElementSource(scene.audio);
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
    const options = { videoBitsPerSecond: 7200000, audioBitsPerSecond: 128000 };
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
    for (const scene of scenes) {
      scene.audio.currentTime = 0;
      setTimeout(() => {
        scene.audio.play().catch((error) => postLog(error && error.stack ? error.stack : String(error)));
      }, scene.start * 1000);
    }
    requestAnimationFrame(animate);
    await sleep(runtimeDuration * 1000);
    recorder.stop();

    const videoBlob = await stopped;
    const posterTime = scenes[7].start + scenes[7].duration * 0.52;
    draw(posterTime);
    const posterBlob = await canvasPngBlob();
    const posterResult = await uploadBlob("/poster", posterBlob, { "Content-Type": "image/png" });
    const sceneTiming = scenes.map((scene) => ({
      key: scene.key,
      title: scene.title,
      subtitle: scene.subtitle,
      startSeconds: scene.start,
      durationSeconds: scene.duration
    }));
    const videoResult = await uploadBlob("/save", videoBlob, {
      "Content-Type": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Render-Mime": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Duration": String(runtimeDuration),
      "X-Scene-Timing": encodeURIComponent(JSON.stringify(sceneTiming))
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

    const imageMatch = /^\/images\/([^/]+)\.png$/.exec(url.pathname);
    if (req.method === "GET" && imageMatch) {
      const filePath = imageInputs[imageMatch[1]];
      if (!filePath) {
        res.writeHead(404);
        res.end("Missing image");
        return;
      }
      streamFile(req, res, filePath);
      return;
    }

    const audioMatch = /^\/audio\/([^/]+)\.wav$/.exec(url.pathname);
    if (req.method === "GET" && audioMatch) {
      const filePath = audioInputs[audioMatch[1]];
      if (!filePath) {
        res.writeHead(404);
        res.end("Missing audio");
        return;
      }
      streamFile(req, res, filePath);
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
      const sceneTiming = JSON.parse(decodeURIComponent(req.headers["x-scene-timing"] || "%5B%5D"));
      const metadata = {
        outputPath,
        mime: req.headers["x-render-mime"] || req.headers["content-type"] || "video/webm",
        bytes: body.length,
        durationSeconds: Number(req.headers["x-duration"] || "0"),
        sceneTiming,
        imageInputs,
        audioInputs,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(outputPath, body);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      const result = { outputPath, metaPath, bytes: body.length, mime: metadata.mime, durationSeconds: metadata.durationSeconds };
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
  }, 260000);

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
