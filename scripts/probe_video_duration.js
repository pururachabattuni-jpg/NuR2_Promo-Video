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

const videoPath = path.resolve(readArg("--video", path.join(ROOT, "renders", "drafts", "nur2_nutrient_paradox_20s.mp4")));
const chromePath = readArg("--chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const expectedSeconds = Number(readArg("--expect", "20"));

if (!fs.existsSync(videoPath)) {
  throw new Error(`Missing video: ${videoPath}`);
}

let resolveProbe;
let rejectProbe;
const probePromise = new Promise((resolve, reject) => {
  resolveProbe = resolve;
  rejectProbe = reject;
});

function streamVideo(res) {
  const ext = path.extname(videoPath).toLowerCase();
  const contentType = ext === ".webm" ? "video/webm" : "video/mp4";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fs.statSync(videoPath).size,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(videoPath).pipe(res);
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const html = `<!doctype html>
<html>
<body>
<video id="v" src="/video.mp4" preload="metadata"></video>
<script>
const v = document.getElementById("v");
const expectedSeconds = ${JSON.stringify(expectedSeconds)};
v.onloadedmetadata = async () => {
  const initialDuration = Number.isFinite(v.duration) ? v.duration : null;
  let playbackError = null;
  try {
    await v.play();
  } catch (error) {
    playbackError = String(error);
  }

  const startedAt = performance.now();
  const maxWaitMs = Math.max(24000, 1000 * expectedSeconds + 3000);
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      if (v.ended || v.currentTime >= expectedSeconds - 0.15 || elapsed >= maxWaitMs || playbackError) {
        clearInterval(timer);
        resolve();
      }
    }, 250);
  });

  await fetch("/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      duration: initialDuration,
      currentTime: v.currentTime,
      ended: v.ended,
      playbackError,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight
    })
  });
};
v.onerror = async () => {
  await fetch("/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Unable to load video metadata" })
  });
};
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/video.mp4") {
      streamVideo(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/result") {
      const body = await collectRequestBody(req);
      const result = JSON.parse(body);
      res.writeHead(204);
      res.end();
      resolveProbe(result);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    rejectProbe(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error && error.stack ? error.stack : String(error));
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const profileDir = path.join(ROOT, "work", `chrome-probe-profile-${Date.now()}`);
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
  chrome.on("error", rejectProbe);

  const timeout = setTimeout(() => {
    rejectProbe(new Error("Timed out probing video metadata."));
    try {
      chrome.kill();
    } catch (_) {}
  }, Math.max(32000, expectedSeconds * 1000 + 9000));

  probePromise
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
