import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { buildDesignModel } from "../shared/converter.mjs";
import { APP_VERSION, DEFAULT_BACKEND_URL } from "../shared/contracts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, ".data");
const CAPTURES_DIR = path.join(DATA_DIR, "captures");
const PUBLIC_DIR = path.join(__dirname, "public");
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || "3210");
const PUBLIC_BACKEND_URL = normalizePublicBackendUrl(
  process.env.PUBLIC_BACKEND_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
);
const CAPTURE_RETENTION_HOURS = Number(process.env.CAPTURE_RETENTION_HOURS || "168");

ensureDir(CAPTURES_DIR);
cleanupExpiredCaptures();

const server = http.createServer(async (request, response) => {
  try {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || "/", DEFAULT_BACKEND_URL);
    cleanupExpiredCaptures();

    if (request.method === "GET" && isStaticLandingPath(url.pathname)) {
      return serveStaticFile(response, url.pathname);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        appVersion: APP_VERSION,
        backendUrl: PUBLIC_BACKEND_URL,
        captureRetentionHours: CAPTURE_RETENTION_HOURS
      });
    }

    if (request.method === "POST" && url.pathname === "/captures") {
      const body = await readJsonBody(request);
      const capturePackage = normalizeCapturePackage(body);
      attachAssetProxyUrls(capturePackage);
      const designModel = buildDesignModel(capturePackage);
      const captureId = capturePackage.capture.id;
      const createdAt = new Date().toISOString();

      writeCapture(captureId, {
        capturePackage,
        designModel,
        createdAt
      });

      return sendJson(response, 201, {
        captureId,
        status: "ready",
        preview: buildPreview(capturePackage),
        importUrl: buildUrl(`/captures/${captureId}/view`),
        designModelUrl: buildUrl(`/captures/${captureId}/design-model`),
        createdAt
      });
    }

    if (request.method === "GET" && url.pathname === "/captures/recent") {
      return sendJson(response, 200, {
        captures: listRecentCaptures()
      });
    }

    const assetMatch = url.pathname.match(/^\/assets\/([^/]+)\/([^/]+)$/);
    if (request.method === "GET" && assetMatch) {
      const [, captureId, assetId] = assetMatch;
      return serveAsset(response, captureId, assetId);
    }

    const captureMatch = url.pathname.match(/^\/captures\/([^/]+)(?:\/(design-model|view))?$/);
    if (captureMatch) {
      const [, captureId, suffix] = captureMatch;
      if (request.method === "DELETE" && !suffix) {
        return deleteCapture(response, captureId);
      }

      const record = readCapture(captureId);
      if (!record) {
        return sendJson(response, 404, { error: "Capture not found." });
      }

      if (request.method === "GET" && !suffix) {
        return sendJson(response, 200, record.capturePackage);
      }

      if (request.method === "GET" && suffix === "design-model") {
        return sendJson(response, 200, record.designModel);
      }

      if (request.method === "GET" && suffix === "view") {
        return sendHtml(response, 200, renderPreviewHtml(captureId, record));
      }
    }

    return sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    console.error("[backend] request failed", {
      method: request.method,
      url: request.url,
      error: error.message || String(error)
    });
    return sendJson(response, 500, {
      error: error.message || "Unexpected server error."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`HTML-to-Figma backend running at ${PUBLIC_BACKEND_URL}`);
});

function normalizeCapturePackage(payload) {
  if (!payload?.capture || !Array.isArray(payload?.nodes)) {
    throw new Error("Request body must contain capture metadata and nodes.");
  }

  return {
    appVersion: payload.appVersion || APP_VERSION,
    capture: payload.capture,
    nodes: payload.nodes,
    assets: Array.isArray(payload.assets) ? payload.assets : [],
    debug: payload.debug || {}
  };
}

function normalizePublicBackendUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function serveAsset(response, captureId, assetId) {
  const record = readCapture(captureId);
  if (!record) {
    return sendJson(response, 404, { error: "Capture not found." });
  }

  const asset = record.capturePackage.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.kind !== "image" || !asset.url) {
    return sendJson(response, 404, { error: "Image asset not found." });
  }

  if (asset.url.startsWith("data:")) {
    const dataMatch = asset.url.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!dataMatch) {
      return sendJson(response, 422, { error: "Invalid data URL asset." });
    }

    const mimeType = dataMatch[1] || asset.mimeType || "application/octet-stream";
    const payload = dataMatch[2]
      ? Buffer.from(dataMatch[3], "base64")
      : Buffer.from(decodeURIComponent(dataMatch[3]));

    response.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=3600"
    });
    response.end(payload);
    return;
  }

  try {
    const upstream = await fetch(asset.url, {
      headers: {
        "User-Agent": "HTML-to-Figma Local Importer"
      }
    });

    if (!upstream.ok) {
      return sendJson(response, upstream.status, {
        error: `Remote image fetch failed with ${upstream.status}.`
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") || asset.mimeType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600"
    });
    response.end(buffer);
  } catch (error) {
    return sendJson(response, 502, {
      error: error.message || "Remote image fetch failed."
    });
  }
}

function isStaticLandingPath(pathname) {
  return pathname === "/"
    || pathname === "/index.html"
    || pathname === "/privacy"
    || pathname === "/privacy.html"
    || pathname === "/terms"
    || pathname === "/terms.html"
    || pathname === "/styles.css"
    || pathname === "/app.js";
}

function serveStaticFile(response, pathname) {
  const fileName = staticFileName(pathname);
  const filePath = path.resolve(PUBLIC_DIR, fileName);
  const publicRoot = path.resolve(PUBLIC_DIR);

  if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath)) {
    return sendJson(response, 404, { error: "File not found." });
  }

  response.writeHead(200, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": "no-store"
  });
  response.end(fs.readFileSync(filePath));
}

function staticFileName(pathname) {
  if (pathname === "/") {
    return "index.html";
  }
  if (pathname === "/privacy") {
    return "privacy.html";
  }
  if (pathname === "/terms") {
    return "terms.html";
  }
  return pathname.slice(1);
}

function getContentType(filePath) {
  const extension = path.extname(filePath);
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".js") {
    return "application/javascript; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}

function attachAssetProxyUrls(capturePackage) {
  for (const asset of capturePackage.assets) {
    if (asset.kind === "image" && asset.url) {
      asset.proxyUrl = buildUrl(`/assets/${capturePackage.capture.id}/${asset.id}`);
    }
  }
}

function buildPreview(capturePackage) {
  return {
    title: capturePackage.capture.title,
    url: capturePackage.capture.sourceUrl,
    mode: capturePackage.capture.mode,
    nodeCount: capturePackage.nodes.length,
    assetCount: capturePackage.assets.length,
    frame: capturePackage.capture.frame
  };
}

function listRecentCaptures() {
  const files = fs.readdirSync(CAPTURES_DIR).filter((file) => file.endsWith(".json"));
  const captures = files
    .map((file) => {
      const fullPath = path.join(CAPTURES_DIR, file);
      const record = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      return {
        captureId: record.capturePackage.capture.id,
        title: record.capturePackage.capture.title,
        url: record.capturePackage.capture.sourceUrl,
        mode: record.capturePackage.capture.mode,
        nodeCount: record.capturePackage.nodes.length,
        assetCount: record.capturePackage.assets.length,
        createdAt: record.createdAt,
        importUrl: buildUrl(`/captures/${record.capturePackage.capture.id}/view`),
        designModelUrl: buildUrl(`/captures/${record.capturePackage.capture.id}/design-model`)
      };
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  return captures.slice(0, 20);
}

function readCapture(captureId) {
  const fullPath = path.join(CAPTURES_DIR, `${captureId}.json`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function writeCapture(captureId, record) {
  fs.writeFileSync(
    path.join(CAPTURES_DIR, `${captureId}.json`),
    JSON.stringify(record, null, 2),
    "utf8"
  );
}

function deleteCapture(response, captureId) {
  const fullPath = path.join(CAPTURES_DIR, `${captureId}.json`);
  if (!fs.existsSync(fullPath)) {
    return sendJson(response, 404, { error: "Capture not found." });
  }

  fs.rmSync(fullPath, { force: true });
  return sendJson(response, 200, {
    ok: true,
    captureId,
    deletedAt: new Date().toISOString()
  });
}

function cleanupExpiredCaptures() {
  if (!Number.isFinite(CAPTURE_RETENTION_HOURS) || CAPTURE_RETENTION_HOURS <= 0) {
    return;
  }

  const cutoff = Date.now() - CAPTURE_RETENTION_HOURS * 60 * 60 * 1000;
  for (const file of fs.readdirSync(CAPTURES_DIR).filter((candidate) => candidate.endsWith(".json"))) {
    const fullPath = path.join(CAPTURES_DIR, file);
    try {
      const record = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const createdAt = new Date(record.createdAt || record.capturePackage?.capture?.capturedAt || 0).getTime();
      if (Number.isFinite(createdAt) && createdAt < cutoff) {
        fs.rmSync(fullPath, { force: true });
      }
    } catch (error) {
      console.warn("[backend] could not inspect capture for retention cleanup", file, error.message);
    }
  }
}

function renderPreviewHtml(captureId, record) {
  const preview = buildPreview(record.capturePackage);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(preview.title)}</title>
    <style>
      body {
        margin: 0;
        font-family: "SF Pro Display", "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f9f5eb 0%, #f0ebdf 100%);
        color: #141414;
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 40px 20px 56px;
      }
      .hero, .panel {
        background: rgba(255,255,255,0.9);
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 24px;
        box-shadow: 0 18px 44px rgba(0,0,0,0.08);
      }
      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }
      .eyebrow {
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #0f7cf1;
      }
      h1 {
        margin: 0;
        font-size: 36px;
        letter-spacing: -0.05em;
      }
      p {
        line-height: 1.5;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .panel {
        padding: 22px;
      }
      .meta {
        color: #5f5f5f;
        margin-top: 10px;
      }
      a.button {
        display: inline-block;
        margin-top: 16px;
        padding: 12px 16px;
        border-radius: 14px;
        text-decoration: none;
        background: #101010;
        color: white;
        font-weight: 700;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: rgba(0,0,0,0.05);
        border-radius: 8px;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Capture Ready</p>
        <h1>${escapeHtml(preview.title)}</h1>
        <p class="meta">${escapeHtml(preview.url)}</p>
        <p>This capture is stored locally by the HTML-to-Figma backend. Open the Figma plugin, refresh recent captures, and import <code>${escapeHtml(captureId)}</code>.</p>
        <a class="button" href="${buildUrl(`/captures/${captureId}/design-model`)}">View design model JSON</a>
      </section>
      <section class="panel grid">
        <div>
          <strong>Mode</strong>
          <p>${escapeHtml(preview.mode)}</p>
        </div>
        <div>
          <strong>Nodes</strong>
          <p>${preview.nodeCount}</p>
        </div>
        <div>
          <strong>Assets</strong>
          <p>${preview.assetCount}</p>
        </div>
        <div>
          <strong>Frame</strong>
          <p>${preview.frame.width} × ${preview.frame.height}</p>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function buildUrl(pathname) {
  return `${PUBLIC_BACKEND_URL}${pathname}`;
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
