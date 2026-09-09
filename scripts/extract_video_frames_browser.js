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

function parseFrameSpecs(value) {
  return value.split(",").map((entry) => {
    const [name, time] = entry.split("@");
    if (!name || !time) throw new Error(`Bad frame spec: ${entry}`);
    return { name, time: Number(time) };
  });
}

const videoPath = path.resolve(readArg("--video", path.join(ROOT, "assets", "source", "nur2_water_story_v3_compressed.mp4")));
const outDir = path.resolve(readArg("--out-dir", path.join(ROOT, "assets", "original_frames")));
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const frames = parseFrameSpecs(readArg("--frames", "bg3_dead_zone_original@65.75,bg6_dark_cup_original@121.5"));

if (!fs.existsSync(videoPath)) throw new Error(`Missing video: ${videoPath}`);
fs.mkdirSync(outDir, { recursive: true });

let resolveDone;
let rejectDone;
const donePromise = new Promise((resolve, reject) => {
  resolveDone = resolve;
  rejectDone = reject;
});

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function streamVideo(req, res) {
  const stat = fs.statSync(videoPath);
  const range = req.headers.range;
  const contentType = path.extname(videoPath).toLowerCase() === ".webm" ? "video/webm" : "video/mp4";
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      fs.createReadStream(videoPath, { start, end }).pipe(res);
      return;
    }
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(videoPath).pipe(res);
}

function pageHtml() {
  const config = { frames };
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Frame Extractor</title></head>
<body>
<video id="video" src="/source.mp4" preload="auto" muted playsinline></video>
<canvas id="canvas" width="1920" height="1080"></canvas>
<script>
(() => {
  const config = ${JSON.stringify(config)};
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  function postLog(message) {
    fetch("/log", { method: "POST", body: String(message) }).catch(() => {});
  }

  function waitForMetadata() {
    if (Number.isFinite(video.duration) && video.duration > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
  }

  function seekTo(time) {
    return new Promise((resolve, reject) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        setTimeout(resolve, 700);
      };
      video.addEventListener("seeked", done);
      video.onerror = reject;
      video.currentTime = time;
    });
  }

  function canvasBlob() {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function upload(name, blob) {
    const response = await fetch("/frame?name=" + encodeURIComponent(name), {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: await blob.arrayBuffer()
    });
    if (!response.ok) throw new Error("Upload failed for " + name + ": " + response.status);
    return response.json();
  }

  async function main() {
    await waitForMetadata();
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    try {
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 300));
      video.pause();
    } catch (_) {}
    const results = [];
    for (const frame of config.frames) {
      await seekTo(frame.time);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      results.push(await upload(frame.name, await canvasBlob()));
    }
    await fetch("/done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results)
    });
  }

  window.onerror = (message, source, line, column, error) => {
    postLog(String(message) + " at " + line + ":" + column + "\\n" + (error && error.stack ? error.stack : ""));
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
    if (req.method === "GET" && url.pathname === "/source.mp4") {
      streamVideo(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/frame") {
      const name = (url.searchParams.get("name") || "frame").replace(/[^a-zA-Z0-9_-]/g, "_");
      const outputPath = path.join(outDir, `${name}.png`);
      const body = await collectRequestBody(req);
      fs.writeFileSync(outputPath, body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ outputPath, bytes: body.length }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/done") {
      const body = await collectRequestBody(req);
      const results = JSON.parse(body.toString("utf8"));
      res.writeHead(204);
      res.end();
      resolveDone(results);
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
    rejectDone(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error && error.stack ? error.stack : String(error));
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const profileDir = path.join(ROOT, "work", `chrome-frame-profile-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profileDir}`,
    `http://127.0.0.1:${address.port}/`
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  chrome.stderr.on("data", (data) => process.stderr.write(data));
  chrome.on("error", rejectDone);

  const timeout = setTimeout(() => {
    rejectDone(new Error("Timed out extracting frames."));
    try {
      chrome.kill();
    } catch (_) {}
  }, 45000);

  donePromise
    .then((results) => {
      clearTimeout(timeout);
      console.log(JSON.stringify(results, null, 2));
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
