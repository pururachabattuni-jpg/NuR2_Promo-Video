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
const stem = readArg("--stem", "nur2_part1_preview");
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");

const imageInputs = {
  bg1: path.join(ROOT, "assets", "overlays", "scene_01_nutrient_paradox_corn_wheat_field.png"),
  tractor: path.join(ROOT, "assets", "generated", "scene_02_fertilizing_crops_tractor_sprayer_vivid.png"),
  irrigation: path.join(ROOT, "assets", "generated", "crop_irrigation.jpg"),
  bg2: path.join(ROOT, "assets", "overlays", "scene_02_corn_raindrop_nutrients.png"),
  stream: path.join(ROOT, "assets", "generated", "scene_02_field_to_stream_runoff.png")
};

const audioInput = path.join(ROOT, "work", "audio", "part1_voiceover_timed.wav");

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
    {
      key: "scene1",
      title: "The Nutrient Paradox",
      startSeconds: 0,
      durationSeconds: 6,
      caption: "THE NUTRIENT PARADOX. The lost nutrient."
    },
    {
      key: "scene2",
      title: "Fertilizing Crops",
      startSeconds: 6,
      durationSeconds: 15,
      caption: "Every harvest begins with nutrients. Nitrogen and phosphorus are essential to feed the world."
    },
    {
      key: "scene3",
      title: "Crop Irrigation",
      startSeconds: 21,
      durationSeconds: 9,
      caption: "It begins with water from the spray of an irrigation pivot."
    },
    {
      key: "scene4",
      title: "Follow One Drop",
      startSeconds: 30,
      durationSeconds: 25,
      caption: "As water moves across the land, it picks up nitrogen and phosphorus meant for crops."
    },
    {
      key: "scene5",
      title: "Into the Stream",
      startSeconds: 55,
      durationSeconds: 15,
      caption: "It carries the nutrients into a ditch, then a stream, then a river, lake, or ocean."
    }
  ];

  const config = {
    width: 1920,
    height: 1080,
    fps: 30,
    images: Object.keys(imageInputs),
    totalDuration: 70,
    sceneTiming
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NuR2 Part 1 Preview</title>
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
  const TRANSITION = 0.75;
  const images = {};

  for (const key of CONFIG.images) {
    const image = new Image();
    image.src = "/images/" + key;
    images[key] = image;
  }

  const narration = new Audio("/audio/voiceover.wav");
  narration.preload = "auto";

  const nutrients = [
    { symbol: "N", label: "Nitrogen", color: "#1bd3ff" },
    { symbol: "P", label: "Phosphorus", color: "#ffd34f" },
    { symbol: "Mg", label: "Magnesium", color: "#68f2c0" },
    { symbol: "K", label: "Potassium", color: "#c884ff" },
    { symbol: "Ca", label: "Calcium", color: "#a8ef63" }
  ];

  const sprayDrops = Array.from({ length: 120 }, (_, index) => ({
    lane: index % 5,
    offset: ((index * 37) % 100) / 100,
    size: 3 + (index % 7),
    drift: ((index * 17) % 31) - 15,
    color: nutrients[index % nutrients.length].color
  }));

  const runoffDots = Array.from({ length: 120 }, (_, index) => ({
    offset: ((index * 41) % 100) / 100,
    lane: index % 9,
    size: 5 + (index % 8),
    color: nutrients[index % nutrients.length].color,
    label: nutrients[index % nutrients.length].symbol,
    phase: index * 0.19
  }));

  const streamDots = Array.from({ length: 96 }, (_, index) => ({
    offset: ((index * 29) % 100) / 100,
    lane: index % 11,
    size: 4 + (index % 7),
    color: nutrients[index % nutrients.length].color,
    phase: index * 0.23
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

  function easeInOutCubic(x) {
    const t = clamp(x, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

  function drawWash(alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const top = ctx.createLinearGradient(0, 0, 0, H);
    top.addColorStop(0, "rgba(1, 36, 22, 0.08)");
    top.addColorStop(0.55, "rgba(2, 28, 18, 0.04)");
    top.addColorStop(1, "rgba(2, 14, 11, 0.46)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawCaption(scene, localT) {
    const inFade = smoothstep(0, 0.6, localT);
    const outFade = 1 - smoothstep(scene.durationSeconds - 0.8, scene.durationSeconds, localT);
    const alpha = Math.min(inFade, outFade);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 48px Arial, sans-serif";
    const metrics = ctx.measureText(scene.caption);
    const boxWidth = Math.min(W - 260, Math.max(960, metrics.width + 120));
    const boxX = (W - boxWidth) / 2;
    const boxY = H - 166;
    roundedRect(boxX, boxY, boxWidth, 96, 8);
    ctx.fillStyle = "rgba(4, 18, 14, 0.58)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    ctx.fillText(scene.caption, W / 2, boxY + 50, boxWidth - 70);
    ctx.restore();
  }

  function drawTitleLockup(primary, secondary, alpha, y = 500) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.52)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 92px Arial, sans-serif";
    ctx.fillText(primary, W / 2, y, W - 240);
    ctx.font = "700 48px Arial, sans-serif";
    ctx.fillStyle = "#d7fff0";
    ctx.fillText(secondary, W / 2, y + 78, W - 320);
    ctx.restore();
  }

  function drawNutrientOrb(x, y, r, nutrient, alpha = 1, pulse = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * (1.65 + pulse));
    glow.addColorStop(0, rgba(nutrient.color, 0.58));
    glow.addColorStop(0.55, rgba(nutrient.color, 0.2));
    glow.addColorStop(1, rgba(nutrient.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.9 + pulse), 0, Math.PI * 2);
    ctx.fill();

    const fill = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
    fill.addColorStop(0, "rgba(255,255,255,0.96)");
    fill.addColorStop(0.58, rgba(nutrient.color, 0.95));
    fill.addColorStop(1, rgba(nutrient.color, 0.62));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(4, r * 0.08);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
    ctx.fillStyle = "#06201a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 " + Math.round(r * 0.78) + "px Arial, sans-serif";
    ctx.fillText(nutrient.symbol, x, y + r * 0.03);
    ctx.restore();
  }

  function drawSpray(localT) {
    const boomY = 440;
    const startX = 1120;
    const intro = easeOutCubic(localT / 2.4);
    ctx.save();
    ctx.globalAlpha = 0.84 * intro;
    ctx.lineCap = "round";
    for (let i = 0; i < 13; i += 1) {
      const nozzleX = 280 + i * 72;
      ctx.strokeStyle = i % 2 === 0 ? "rgba(218,255,240,0.46)" : "rgba(164,232,255,0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(nozzleX, boomY + 18);
      ctx.lineTo(nozzleX - 34, 706);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(nozzleX + 16, boomY + 20);
      ctx.lineTo(nozzleX + 38, 696);
      ctx.stroke();
    }
    ctx.restore();

    for (const drop of sprayDrops) {
      const t = (drop.offset + localT * 0.18) % 1;
      const x0 = startX - drop.lane * 160;
      const x = x0 - t * 740 + Math.sin(t * Math.PI * 2 + drop.drift) * 18;
      const y = boomY + 28 + t * 300 + Math.sin((t + drop.offset) * Math.PI * 4) * 16;
      const alpha = intro * (1 - Math.abs(t - 0.55) * 1.25);
      drawNutrientOrb(x, y, drop.size * 2.2, nutrients[drop.lane % nutrients.length], Math.max(0, alpha) * 0.62, 0.05);
    }
  }

  function drawNutrientIntro(localT) {
    const positions = [
      [330, 222, 54],
      [505, 190, 50],
      [690, 224, 46],
      [850, 178, 48],
      [1015, 224, 44]
    ];

    positions.forEach(([x, y, r], index) => {
      const appear = smoothstep(0.55 + index * 0.33, 1.5 + index * 0.33, localT);
      const floatY = Math.sin(localT * 1.6 + index) * 9;
      drawNutrientOrb(x, y + floatY, r, nutrients[index], appear, Math.sin(localT * 2 + index) * 0.05);
      if (appear > 0.6) {
        ctx.save();
        ctx.globalAlpha = appear * 0.84;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 24px Arial, sans-serif";
        ctx.shadowColor = "rgba(0,0,0,0.52)";
        ctx.shadowBlur = 8;
        ctx.fillText(nutrients[index].label, x, y + r + 36, 170);
        ctx.restore();
      }
    });
  }

  function drawPivotSpray(localT) {
    const centerX = 960;
    const pivotY = 255;
    const sweep = Math.sin(localT * 0.75) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = "rgba(222,246,255,0.5)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(centerX - 610, pivotY + 20);
    ctx.quadraticCurveTo(centerX - 40, pivotY - 34, centerX + 590, pivotY + 36);
    ctx.stroke();
    for (let i = 0; i < 16; i += 1) {
      const x = centerX - 560 + i * 74;
      const drop = (localT * 0.32 + i * 0.11) % 1;
      const sprayTop = pivotY + 34 + Math.sin(i + localT) * 11;
      const targetX = x + Math.sin(i * 1.7 + localT) * 36 + sweep * 180;
      const targetY = lerp(sprayTop, 780, drop);
      ctx.strokeStyle = "rgba(219,248,255,0.27)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, sprayTop);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.fillStyle = i % 2 ? "rgba(212,252,255,0.62)" : "rgba(255,255,255,0.54)";
      ctx.beginPath();
      ctx.arc(targetX, targetY, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEdgeFlow(localT, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const collect = smoothstep(0.5, 2.2, localT);
    for (const dot of runoffDots) {
      const p = (dot.offset + localT * 0.052) % 1;
      const side = dot.lane % 2 === 0 ? -1 : 1;
      const x0 = W * (0.48 + Math.sin(dot.phase) * 0.18);
      const y0 = H * (0.50 + (dot.lane / 11) * 0.28);
      const x = lerp(x0, side < 0 ? W * 0.15 : W * 0.87, easeInOutCubic(p));
      const y = y0 + Math.sin(p * Math.PI * 2 + dot.phase) * 18;
      const nutrient = nutrients[dot.lane % nutrients.length];
      drawNutrientOrb(x, y, dot.size * 1.8, nutrient, collect * 0.6, 0.02);
    }
    ctx.restore();
  }

  function drawDropPath(localT) {
    const p = clamp(localT / 20, 0, 1);
    const x = lerp(260, 1580, easeInOutCubic(p));
    const y = 475 + Math.sin(p * Math.PI * 2.1) * 100 + p * 265;
    ctx.save();
    ctx.globalAlpha = smoothstep(0, 1.2, localT) * (1 - smoothstep(23.2, 25, localT));
    ctx.strokeStyle = "rgba(159,238,255,0.75)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const q = i / 40;
      const px = lerp(230, x, q);
      const py = 450 + Math.sin(q * Math.PI * 2.1) * 98 + q * (y - 450);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const drop = ctx.createRadialGradient(x - 18, y - 26, 8, x, y, 50);
    drop.addColorStop(0, "rgba(255,255,255,0.92)");
    drop.addColorStop(0.55, "rgba(86,205,255,0.72)");
    drop.addColorStop(1, "rgba(40,153,255,0.15)");
    ctx.fillStyle = drop;
    ctx.beginPath();
    ctx.ellipse(x, y, 38, 52, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.68)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  function drawRunoffNutrients(localT) {
    for (const dot of runoffDots) {
      const p = (dot.offset + localT * 0.048) % 1;
      const baseX = 135 + (((dot.offset * 0.83 + dot.lane * 0.071) % 1) * 1510);
      const baseY = 752 + ((dot.lane * 31 + Math.floor(dot.offset * 100)) % 205);
      const nutrient = nutrients[dot.lane % nutrients.length];
      const emerge = clamp(p / 0.30, 0, 1);
      const carry = clamp((p - 0.30) / 0.70, 0, 1);
      const lift = easeOutCubic(emerge);
      const carried = easeInOutCubic(carry);
      const waterPush = 270 + ((dot.lane * 29) % 210);

      let x = baseX + Math.sin(dot.phase + localT * 1.4) * 7;
      let y = baseY - lift * (64 + (dot.lane % 4) * 9);
      let alpha = smoothstep(0.02, 0.16, p) * (1 - smoothstep(0.92, 1, p)) * 0.66;

      ctx.save();
      ctx.globalAlpha = alpha * (1 - carried * 0.35);
      ctx.strokeStyle = rgba(nutrient.color, 0.42);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(baseX, baseY + 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
      ctx.fillStyle = rgba(nutrient.color, 0.32);
      ctx.beginPath();
      ctx.ellipse(baseX, baseY + 12, 22 + lift * 14, 7 + lift * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (carry > 0) {
        x = baseX + waterPush * carried + Math.sin((carried + dot.phase) * Math.PI * 3) * 22;
        y = baseY - 58 + carried * 24 + Math.sin((carried + dot.offset) * Math.PI * 2) * 18;
        alpha *= 0.86;
      }

      drawNutrientOrb(x, y, dot.size * 1.65, nutrient, alpha, 0.02);
    }
  }

  function drawStreamFlow(localT) {
    const inflows = [
      { x0: 310, y0: 620, x1: 560, y1: 812, width: 58, phase: 0 },
      { x0: 860, y0: 548, x1: 790, y1: 708, width: 42, phase: 0.37 },
      { x0: 1518, y0: 524, x1: 1336, y1: 655, width: 44, phase: 0.71 }
    ];

    function streamPoint(p, lane = 0) {
      const x = 486 + p * 1040 + Math.sin(p * Math.PI * 2.2) * 38;
      const y = 875 - p * 535 + Math.sin(p * Math.PI * 1.6 + 0.4) * 44 + lane * 5;
      return { x, y };
    }

    ctx.save();
    ctx.globalAlpha = 0.22 + Math.sin(localT * 1.7) * 0.04;
    ctx.strokeStyle = "rgba(206,255,232,0.42)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      for (let j = 0; j <= 44; j += 1) {
        const p = j / 44;
        const point = streamPoint(p, i - 3);
        const x = point.x + Math.sin(p * 12 + i) * 13;
        const y = point.y + i * 13;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const inflow of inflows) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.lineCap = "round";
      for (let ribbon = 0; ribbon < 6; ribbon += 1) {
        const wobble = Math.sin(localT * 1.9 + ribbon + inflow.phase) * 7;
        ctx.strokeStyle = ribbon % 2 ? "rgba(190,244,255,0.42)" : "rgba(242,255,250,0.6)";
        ctx.lineWidth = Math.max(3, inflow.width / (4.2 + ribbon));
        ctx.beginPath();
        ctx.moveTo(inflow.x0 + ribbon * 8 - 20, inflow.y0 + wobble);
        ctx.quadraticCurveTo(
          lerp(inflow.x0, inflow.x1, 0.55) + wobble * 2,
          lerp(inflow.y0, inflow.y1, 0.55) + 38,
          inflow.x1 + ribbon * 6 - 18,
          inflow.y1
        );
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(220,255,247,0.18)";
      ctx.beginPath();
      ctx.ellipse(inflow.x0, inflow.y0 - 6, inflow.width * 0.85, inflow.width * 0.22, -0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(230,255,248,0.34)";
      ctx.beginPath();
      ctx.ellipse(inflow.x1, inflow.y1 + 10, inflow.width * 1.2, inflow.width * 0.32, -0.1, 0, Math.PI * 2);
      ctx.fill();
      for (let splash = 0; splash < 9; splash += 1) {
        const angle = -Math.PI * 0.9 + splash * 0.21;
        const pulse = ((localT * 0.45 + splash * 0.13 + inflow.phase) % 1);
        const distance = 12 + pulse * inflow.width * 0.85;
        ctx.fillStyle = "rgba(238,255,250," + (0.42 * (1 - pulse)) + ")";
        ctx.beginPath();
        ctx.arc(inflow.x1 + Math.cos(angle) * distance, inflow.y1 + Math.sin(angle) * distance * 0.55, 3 + splash % 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      for (let i = 0; i < 14; i += 1) {
        const nutrient = nutrients[(i + Math.round(inflow.phase * 10)) % nutrients.length];
        const p = ((i * 0.073 + localT * 0.18 + inflow.phase) % 1);
        const q = easeInOutCubic(p);
        const x = lerp(inflow.x0, inflow.x1, q) + Math.sin(q * Math.PI * 4 + i) * 18;
        const y = lerp(inflow.y0, inflow.y1, q) + Math.sin(q * Math.PI) * 36;
        const alpha = smoothstep(0.03, 0.18, p) * (1 - smoothstep(0.88, 1, p)) * 0.52;
        drawNutrientOrb(x, y, 9 + (i % 4) * 3, nutrient, alpha, 0.01);
      }
    }

    for (const dot of streamDots) {
      if ((Math.floor(dot.offset * 1000) + dot.lane) % 2 !== 0) continue;
      const p = (dot.offset + localT * 0.034) % 1;
      const lane = (dot.lane % 7) - 3;
      const point = streamPoint(p, lane);
      const x = point.x + Math.sin(dot.phase + localT * 1.1) * (14 + (dot.lane % 3) * 5);
      const y = point.y + Math.cos(dot.phase + localT * 0.8) * 18;
      const alpha = 0.14 + 0.28 * Math.sin(Math.PI * p);
      drawNutrientOrb(x, y, dot.size * 1.22, nutrients[dot.lane % nutrients.length], alpha, 0.02);
    }
    ctx.restore();
  }

  function drawScene1(localT, scene) {
    drawCoverImage(images.bg1, 0, 1, { zoom: 1.03, panY0: -10 });
    drawWash();
    drawTitleLockup("THE NUTRIENT PARADOX", "The lost nutrient", smoothstep(0.35, 1.2, localT), 476);
    drawCaption(scene, localT);
  }

  function drawScene2(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.tractor, progress, 1, { zoom: 1.02, panX0: -14, panX1: 16, panY0: -6, panY1: 4, filter: "saturate(1.15) contrast(1.04)" });
    drawWash(0.82);
    drawNutrientIntro(localT);
    drawSpray(localT);
    drawCaption(scene, localT);
  }

  function drawScene3(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.irrigation, progress, 1, { zoom: 1.08, panX0: -18, panX1: 20, panY0: -8, panY1: 6, filter: "saturate(1.18) contrast(1.08)" });
    drawWash(0.7);
    drawPivotSpray(localT);
    drawEdgeFlow(localT, 0.92);
    drawCaption(scene, localT);
  }

  function drawScene4(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.bg2, progress, 1, { zoom: 1.03, panX0: -20, panX1: 28, panY0: -8, panY1: 10, filter: "saturate(1.12) contrast(1.05)" });
    drawWash(0.78);
    drawDropPath(localT);
    drawRunoffNutrients(localT);
    drawCaption(scene, localT);
  }

  function drawScene5(localT, scene) {
    const progress = clamp(localT / scene.durationSeconds, 0, 1);
    drawCoverImage(images.stream, progress, 1, { zoom: 1.04, panX0: -22, panX1: 24, panY0: -10, panY1: 8, filter: "saturate(1.16) contrast(1.05)" });
    drawWash(0.65);
    drawStreamFlow(localT);
    drawCaption(scene, localT);
  }

  const scenes = [
    { ...CONFIG.sceneTiming[0], draw: drawScene1 },
    { ...CONFIG.sceneTiming[1], draw: drawScene2 },
    { ...CONFIG.sceneTiming[2], draw: drawScene3 },
    { ...CONFIG.sceneTiming[3], draw: drawScene4 },
    { ...CONFIG.sceneTiming[4], draw: drawScene5 }
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
    draw(62);
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
  const profileDir = path.join(ROOT, "work", `chrome-render-profile-part1-${Date.now()}`);
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
  }, 180000);

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
