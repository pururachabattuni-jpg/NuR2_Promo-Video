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
const stem = readArg("--stem", "nur2_part2_preview");
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");

const imageInputs = {
  algae: path.join(ROOT, "assets", "generated", "Alge_stream.png"),
  algaeBoat: path.join(ROOT, "assets", "generated", "alge_with_boat.jpg"),
  dead: path.join(ROOT, "assets", "original_frames", "scene_03_dead_zone_original_frame.png"),
  cup: path.join(ROOT, "assets", "original_frames", "scene_06_dark_contamination_cup_original_frame.png"),
  ogallala: path.join(ROOT, "assets", "generated", "ogallala.png"),
  vulnerableAquifer: path.join(ROOT, "assets", "generated", "Vulnerable_acquifer.jpg")
};

const audioInput = path.join(ROOT, "work", "audio", "part2_voiceover_timed.wav");

for (const filePath of [...Object.values(imageInputs), audioInput]) {
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
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
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
  const sceneTiming = [
    { key: "scene6", title: "The Downstream Cascade", startSeconds: 0, durationSeconds: 5, globalStart: "1:10", caption: "Downstream, these nutrients feed algae." },
    { key: "scene7", title: "Algal Bloom", startSeconds: 5, durationSeconds: 5, globalStart: "1:15", caption: "A green layer spreads across the water bodies." },
    { key: "scene8", title: "Dead Zones", startSeconds: 10, durationSeconds: 12, globalStart: "1:20", caption: "Blooms block sunlight, consume oxygen, and aquatic life dies." },
    { key: "scene9", title: "It Goes Deeper", startSeconds: 22, durationSeconds: 23, globalStart: "1:32", caption: "Nutrient excess seeps down and changes groundwater chemistry." },
    { key: "scene10", title: "The Ogallala Aquifer", startSeconds: 45, durationSeconds: 7, globalStart: "1:55", caption: "Nitrates contaminate a massive groundwater source." },
    { key: "scene11", title: "Vulnerable Aquifers", startSeconds: 52, durationSeconds: 10, globalStart: "2:02", caption: "Water source impairment can last for generations." }
  ];

  const config = {
    width: 1920,
    height: 1080,
    fps: 30,
    images: Object.keys(imageInputs),
    totalDuration: 62,
    sceneTiming
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NuR2 Part 2 Preview</title>
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
  const TRANSITION = 0.7;
  const images = {};

  for (const key of CONFIG.images) {
    const image = new Image();
    image.src = "/images/" + key;
    images[key] = image;
  }

  const narration = new Audio("/audio/voiceover.wav");
  narration.preload = "auto";

  const nutrientTypes = [
    { symbol: "P", label: "Phosphorus", color: "#ffd34f" },
    { symbol: "NO3", label: "Nitrate", color: "#39d6ff" },
    { symbol: "P", label: "Phosphorus", color: "#ffe985" },
    { symbol: "NO3", label: "Nitrate", color: "#74f0ff" }
  ];

  const streamParticles = Array.from({ length: 82 }, (_, i) => ({
    offset: ((i * 37) % 100) / 100,
    lane: i % 8,
    size: 8 + (i % 5),
    phase: i * 0.29,
    nutrient: nutrientTypes[i % nutrientTypes.length]
  }));

  const lakeParticles = Array.from({ length: 78 }, (_, i) => ({
    x: 0.08 + (((i * 47) % 86) / 100),
    y: 0.20 + (((i * 31) % 58) / 100),
    size: 7 + (i % 6),
    phase: i * 0.41,
    nutrient: nutrientTypes[i % nutrientTypes.length]
  }));

  const seepParticles = Array.from({ length: 48 }, (_, i) => ({
    x: 0.33 + (((i * 19) % 36) / 100),
    y: 0.24 + (((i * 13) % 18) / 100),
    phase: i * 0.33,
    size: 5 + (i % 5),
    color: i % 2 ? "#ff543e" : "#39d6ff"
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

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawCoverImage(image, progress = 0, alpha = 1, options = {}) {
    const crop = options.crop || { sx: 0, sy: 0, sw: 1, sh: 1 };
    const sx = image.width * crop.sx;
    const sy = image.height * crop.sy;
    const sw = image.width * crop.sw;
    const sh = image.height * crop.sh;
    const baseScale = Math.max(W / sw, H / sh);
    const zoom = baseScale * (options.zoom || 1);
    const drawW = sw * zoom;
    const drawH = sh * zoom;
    const panX = lerp(options.panX0 || 0, options.panX1 || 0, progress);
    const panY = lerp(options.panY0 || 0, options.panY1 || 0, progress);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = options.filter || "none";
    ctx.drawImage(image, sx, sy, sw, sh, (W - drawW) / 2 + panX, (H - drawH) / 2 + panY, drawW, drawH);
    ctx.restore();
  }

  function drawWash(alpha = 1, darkness = 0.36) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "rgba(3, 28, 20, 0.08)");
    gradient.addColorStop(0.58, "rgba(2, 22, 17, 0.04)");
    gradient.addColorStop(1, "rgba(1, 9, 9, " + darkness + ")");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function wrapLines(text, maxWidth, font) {
    ctx.font = font;
    const words = text.split(/\\s+/);
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

  function drawCaption(scene, localT) {
    const inFade = smoothstep(0, 0.45, localT);
    const outFade = 1 - smoothstep(scene.durationSeconds - 0.6, scene.durationSeconds, localT);
    const alpha = Math.min(inFade, outFade);
    if (alpha <= 0) return;

    const font = "800 44px Arial, sans-serif";
    const lines = wrapLines(scene.caption, W - 360, font).slice(0, 2);
    const boxHeight = 48 + lines.length * 52;
    const boxWidth = W - 270;
    const boxX = (W - boxWidth) / 2;
    const boxY = H - boxHeight - 62;

    ctx.save();
    ctx.globalAlpha = alpha;
    roundedRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fillStyle = "rgba(3, 16, 13, 0.66)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    lines.forEach((line, index) => {
      ctx.fillText(line, W / 2, boxY + 44 + index * 52, boxWidth - 90);
    });
    ctx.restore();
  }

  function drawTopTitle(primary, secondary, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    roundedRect(320, 48, 1280, secondary ? 156 : 116, 8);
    ctx.fillStyle = "rgba(2, 15, 14, 0.66)";
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 78px Arial, sans-serif";
    ctx.fillText(primary, W / 2, secondary ? 108 : 106, 1180);
    if (secondary) {
      ctx.font = "600 36px Arial, sans-serif";
      ctx.fillStyle = "#d8fff1";
      ctx.fillText(secondary, W / 2, 174, 1180);
    }
    ctx.restore();
  }

  function drawNutrientOrb(x, y, r, nutrient, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 2.4);
    glow.addColorStop(0, rgba(nutrient.color, 0.5));
    glow.addColorStop(0.55, rgba(nutrient.color, 0.22));
    glow.addColorStop(1, rgba(nutrient.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    const fill = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    fill.addColorStop(0, "rgba(255,255,255,0.94)");
    fill.addColorStop(0.58, rgba(nutrient.color, 0.9));
    fill.addColorStop(1, rgba(nutrient.color, 0.54));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.stroke();
    ctx.fillStyle = "#06201a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 " + Math.round(r * (nutrient.symbol.length > 1 ? 0.52 : 0.82)) + "px Arial, sans-serif";
    ctx.fillText(nutrient.symbol, x, y + r * 0.04);
    ctx.restore();
  }

  function drawStreamNutrients(localT, density = 1) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const dot of streamParticles) {
      if (dot.offset > density) continue;
      const p = (dot.offset + localT * 0.055) % 1;
      const x = lerp(135, 1775, p);
      const y = 786 - Math.sin(p * Math.PI) * 280 + Math.sin(dot.phase + localT * 1.1) * 38 + dot.lane * 9;
      const alpha = 0.22 + 0.42 * Math.sin(Math.PI * p);
      drawNutrientOrb(x, y, dot.size, dot.nutrient, alpha);
    }
    ctx.restore();
  }

  function drawLakeNutrients(localT, alphaScale = 1) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const dot of lakeParticles) {
      const drift = Math.sin(localT * 0.75 + dot.phase) * 18;
      const x = dot.x * W + drift;
      const y = dot.y * H + Math.cos(localT * 0.6 + dot.phase) * 14;
      const alpha = (0.18 + 0.28 * Math.sin(localT + dot.phase)) * alphaScale;
      drawNutrientOrb(x, y, dot.size, dot.nutrient, alpha);
    }
    ctx.restore();
  }

  function drawBloomSpread(localT, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.22 * strength + Math.sin(localT * 1.1) * 0.04;
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(129, 255, 44, 0.22)";
    for (let i = 0; i < 12; i += 1) {
      const x = 150 + ((i * 173) % 1580);
      const y = 380 + Math.sin(localT * 0.7 + i) * 70 + (i % 4) * 70;
      ctx.beginPath();
      ctx.ellipse(x, y, 190 + (i % 3) * 60, 36 + (i % 5) * 14, Math.sin(i) * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSunBlocking(localT) {
    const curtain = smoothstep(0.8, 5, localT);
    ctx.save();
    ctx.globalAlpha = curtain * 0.48;
    ctx.fillStyle = "rgba(21, 96, 30, 0.62)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = curtain * 0.72;
    const beam = ctx.createLinearGradient(W * 0.15, 0, W * 0.55, H);
    beam.addColorStop(0, "rgba(255, 245, 174, 0.68)");
    beam.addColorStop(0.45, "rgba(255, 245, 174, 0.12)");
    beam.addColorStop(0.7, "rgba(255, 245, 174, 0)");
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = curtain * 0.72;
    ctx.fillStyle = "rgba(9, 44, 26, 0.78)";
    ctx.fillRect(0, H * 0.48, W, H * 0.52);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = curtain;
    ctx.strokeStyle = "rgba(255,255,255,0.56)";
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i += 1) {
      const x = 245 + i * 180;
      const y = 780 + Math.sin(localT * 0.9 + i) * 24;
      ctx.beginPath();
      ctx.ellipse(x, y, 58, 18, -0.18 + i * 0.03, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 58, y);
      ctx.lineTo(x + 86, y - 22);
      ctx.lineTo(x + 86, y + 22);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.font = "900 72px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("O2", W - 230, 330);
    ctx.font = "700 38px Arial, sans-serif";
    ctx.fillText("oxygen depleted", W - 230, 392);
    ctx.restore();
  }

  function drawSeepage(localT) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const dot of seepParticles) {
      const p = (dot.phase * 0.17 + localT * 0.08) % 1;
      const x = dot.x * W + Math.sin(localT + dot.phase) * 24;
      const y = lerp(260, 820, p);
      const alpha = smoothstep(0.02, 0.18, p) * (1 - smoothstep(0.84, 1, p)) * 0.68;
      ctx.strokeStyle = rgba(dot.color, alpha * 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 42);
      ctx.lineTo(x + Math.sin(dot.phase) * 18, y + 28);
      ctx.stroke();
      drawNutrientOrb(x, y, dot.size * 1.8, { symbol: dot.color === "#ff543e" ? "NO3" : "P", color: dot.color }, alpha);
    }
    ctx.restore();
  }

  function drawMapLabel(title, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    roundedRect(96, 76, 690, 106, 8);
    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 52px Arial, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 8;
    ctx.fillText(title, 136, 130, 620);
    ctx.restore();
  }

  function drawScene6(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.algae, progress, 1, { zoom: 1.04, panX0: -10, panX1: 18, filter: "saturate(1.18) contrast(1.04)" });
    drawWash(0.72, 0.34);
    drawStreamNutrients(localT, 1);
    drawBloomSpread(localT, 0.68);
    drawTopTitle("THE DOWNSTREAM CASCADE", null, smoothstep(0.1, 0.8, localT));
    drawCaption(scene, localT);
  }

  function drawScene7(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.algaeBoat, progress, 1, { zoom: 1.08, panY0: -2, panY1: 4, filter: "saturate(1.22) contrast(1.05)" });
    drawWash(0.5, 0.31);
    drawLakeNutrients(localT, 0.72);
    drawBloomSpread(localT, 1);
    drawCaption(scene, localT);
  }

  function drawScene8(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.dead, progress, 1, { zoom: 1.22, panY0: 24, panY1: -10, filter: "saturate(1.08) contrast(1.04)" });
    ctx.save();
    const topMask = ctx.createLinearGradient(0, 0, 0, 230);
    topMask.addColorStop(0, "rgb(20, 78, 35)");
    topMask.addColorStop(1, "rgb(29, 96, 43)");
    ctx.fillStyle = topMask;
    ctx.fillRect(0, 0, W, 230);
    const bottomMask = ctx.createLinearGradient(0, H - 320, 0, H);
    bottomMask.addColorStop(0, "rgb(11, 47, 27)");
    bottomMask.addColorStop(1, "rgb(5, 25, 16)");
    ctx.fillStyle = bottomMask;
    ctx.fillRect(0, H - 320, W, 320);
    ctx.restore();
    drawWash(0.84, 0.42);
    drawLakeNutrients(localT, 0.52);
    drawBloomSpread(localT, 1.1);
    drawSunBlocking(localT);
    ctx.save();
    ctx.globalAlpha = smoothstep(6.5, 8.5, localT);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillStyle = "#eafff6";
    ctx.shadowColor = "rgba(0,0,0,0.58)";
    ctx.shadowBlur = 10;
    ctx.fillText("Maumee River, July 2026", W - 98, 94, 560);
    ctx.restore();
    drawCaption(scene, localT);
  }

  function drawScene9(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.cup, progress, 1, { zoom: 1.02, filter: "saturate(0.95) contrast(1.06)" });
    drawWash(0.78, 0.5);
    ctx.save();
    ctx.fillStyle = "rgb(4, 10, 13)";
    ctx.fillRect(0, 0, W, 246);
    ctx.fillStyle = "rgb(4, 12, 12)";
    ctx.fillRect(0, H - 312, W, 312);
    ctx.restore();
    drawSeepage(localT);
    drawTopTitle("IT GOES DEEPER", "Nutrient excess seeps down and changes groundwater chemistry", smoothstep(0.15, 1, localT));
    drawCaption(scene, localT);
  }

  function drawScene10(localT, scene) {
    drawCoverImage(images.ogallala, 0, 1, { zoom: 1.25, panX0: 60, panY0: -10, filter: "saturate(1.08) contrast(1.05)" });
    drawWash(0.44, 0.24);
    drawMapLabel("The Ogallala Aquifer", smoothstep(0.1, 0.7, localT));
    drawCaption(scene, localT);
  }

  function drawScene11(localT, scene) {
    drawCoverImage(images.vulnerableAquifer, 0, 1, { zoom: 1.18, panY0: -18, filter: "saturate(1.08) contrast(1.04)" });
    drawWash(0.34, 0.28);
    drawMapLabel("Vulnerable Aquifers", smoothstep(0.1, 0.7, localT));
    drawCaption(scene, localT);
  }

  const scenes = [
    { ...CONFIG.sceneTiming[0], draw: drawScene6 },
    { ...CONFIG.sceneTiming[1], draw: drawScene7 },
    { ...CONFIG.sceneTiming[2], draw: drawScene8 },
    { ...CONFIG.sceneTiming[3], draw: drawScene9 },
    { ...CONFIG.sceneTiming[4], draw: drawScene10 },
    { ...CONFIG.sceneTiming[5], draw: drawScene11 }
  ];

  function draw(timeSeconds) {
    const t = clamp(timeSeconds, 0, CONFIG.totalDuration);
    let current = scenes[scenes.length - 1];
    for (const scene of scenes) {
      if (t >= scene.startSeconds && t < scene.startSeconds + scene.durationSeconds) {
        current = scene;
        break;
      }
    }

    const localT = t - current.startSeconds;
    current.draw(localT, current);

    const next = scenes.find((scene) => scene.startSeconds > current.startSeconds);
    if (next) {
      const fade = smoothstep(next.startSeconds - TRANSITION, next.startSeconds, t);
      if (fade > 0) {
        ctx.save();
        ctx.globalAlpha = fade;
        next.draw(0, next);
        ctx.restore();
      }
    }
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not load image " + image.src));
    });
  }

  function waitForAudio(audio) {
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      audio.onloadedmetadata = resolve;
      audio.onerror = () => reject(new Error("Could not load audio " + audio.src));
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

  async function uploadBlob(route, blob, headers = {}) {
    const response = await fetch(route, {
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
      waitForAudio(narration)
    ]);

    const videoStream = canvas.captureStream(CONFIG.fps);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const destination = audioContext.createMediaStreamDestination();
    const source = audioContext.createMediaElementSource(narration);
    source.connect(destination);
    source.connect(audioContext.destination);

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
      const t = Math.min((performance.now() - startTime) / 1000, CONFIG.totalDuration);
      draw(t);
      if (t < CONFIG.totalDuration) requestAnimationFrame(animate);
    }

    draw(0);
    await audioContext.resume();
    narration.currentTime = 0;
    recorder.start(1000);
    await narration.play();
    requestAnimationFrame(animate);
    await sleep((CONFIG.totalDuration + 0.25) * 1000);
    recorder.stop();

    const videoBlob = await stopped;
    draw(37);
    const posterBlob = await canvasPngBlob();
    const posterResult = await uploadBlob("/poster", posterBlob, { "Content-Type": "image/png" });
    const videoResult = await uploadBlob("/save", videoBlob, {
      "Content-Type": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Render-Mime": videoBlob.type || recorder.mimeType || "video/webm",
      "X-Duration": String(CONFIG.totalDuration),
      "X-Scene-Timing": encodeURIComponent(JSON.stringify(CONFIG.sceneTiming))
    });

    document.body.innerHTML = "<pre>" + JSON.stringify({ posterResult, videoResult }, null, 2) + "</pre>";
  }

  window.onerror = (message, sourceFile, lineno, colno, error) => {
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

    const imageMatch = /^\/images\/([^/]+)$/.exec(url.pathname);
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

    if (req.method === "GET" && url.pathname === "/audio/voiceover.wav") {
      streamFile(req, res, audioInput);
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
        audioInput,
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
  const profileDir = path.join(ROOT, "work", `chrome-render-profile-part2-${Date.now()}`);
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
  }, 170000);

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
