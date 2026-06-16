try {
  importScripts("config.js");
} catch (error) {
  // Local development can still run if the generated config is absent.
}

const DEFAULT_BACKEND_URL = globalThis.HTML_TO_FIGMA_CONFIG?.backendUrl || "http://localhost:3210";
const STORAGE_KEYS = {
  backendUrl: "htmlToDesign:backendUrl",
  latestCapture: "htmlToDesign:latestCapture"
};

const MESSAGE_DOWNLOAD_EXPORT = "html-to-figma/download-export";
const MESSAGE_CAPTURE_READY = "html-to-figma/capture-ready";
const MESSAGE_OPEN_IMPORT = "html-to-figma/open-import";
const MESSAGE_BACKEND_HEALTH = "html-to-figma/backend-health";
const MESSAGE_FETCH_IMAGE = "html-to-figma/fetch-image";
const MESSAGE_CAPTURE_VIEWPORT = "html-to-figma/capture-viewport";

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get(STORAGE_KEYS.backendUrl);
  if (!result[STORAGE_KEYS.backendUrl]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.backendUrl]: DEFAULT_BACKEND_URL
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  if (message.type === MESSAGE_DOWNLOAD_EXPORT) {
    downloadExport(message.payload)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_CAPTURE_READY) {
    handleCaptureReady(message.capture)
      .then((record) => sendResponse({ ok: true, record }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_OPEN_IMPORT) {
    openImportPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_BACKEND_HEALTH) {
    pingBackend()
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_FETCH_IMAGE) {
    fetchImageAsDataUrl(message.url)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_CAPTURE_VIEWPORT) {
    captureVisibleViewport(_sender?.tab?.windowId)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

// Screenshot the currently visible portion of the tab. The content script
// scrolls the page and calls this for each segment to build a full-page image.
async function captureVisibleViewport(windowId) {
  const options = { format: "png" };
  if (typeof windowId === "number") {
    return chrome.tabs.captureVisibleTab(windowId, options);
  }
  return chrome.tabs.captureVisibleTab(options);
}

// Fetch an image from any origin (CORS-exempt thanks to host_permissions) and
// return it as a base64 data URL so the content script can bake it into the
// capture. This is why captured images never "crash" on import.
async function fetchImageAsDataUrl(url) {
  if (!url || url.startsWith("data:")) {
    return url || null;
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "HTML-to-Figma Capture" }
  });
  if (!response.ok) {
    throw new Error(`Image fetch failed with ${response.status}.`);
  }

  const blob = await response.blob();
  // Guard against pathologically large images bloating the capture payload.
  if (blob.size > 8 * 1024 * 1024) {
    throw new Error("Image exceeds 8MB embed limit.");
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not encode image."));
    reader.readAsDataURL(blob);
  });
}

async function handleCaptureReady(capture) {
  if (!capture?.capture?.id) {
    throw new Error("Capture payload is missing required metadata.");
  }

  const backendUrl = await getBackendUrl();
  const captureSummary = summarizeCapture(capture);
  let record = {
    capture: captureSummary,
    backend: {
      status: "uploading",
      backendUrl,
      error: null
    },
    updatedAt: new Date().toISOString()
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.latestCapture]: record
  });

  try {
    const response = await fetch(`${backendUrl}/captures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(capture)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${payload.error || "Upload failed."}`);
    }

    record = {
      capture: captureSummary,
      backend: {
        status: payload.status || "ready",
        backendUrl,
        captureId: payload.captureId,
        importUrl: payload.importUrl,
        designModelUrl: payload.designModelUrl,
        preview: payload.preview,
        createdAt: payload.createdAt,
        error: null
      },
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    record = {
      capture: captureSummary,
      backend: {
        status: "error",
        backendUrl,
        error: formatFetchError(error, backendUrl)
      },
      updatedAt: new Date().toISOString()
    };
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.latestCapture]: record
  });

  return record;
}

function summarizeCapture(capture) {
  return {
    capture: capture.capture,
    appVersion: capture.appVersion,
    nodeCount: Array.isArray(capture.nodes) ? capture.nodes.length : 0,
    assetCount: Array.isArray(capture.assets) ? capture.assets.length : 0,
    debug: summarizeDebugPayload(capture.debug)
  };
}

function summarizeDebugPayload(debug) {
  const svg = debug?.svg;
  if (typeof svg === "string" && svg.length <= 250000) {
    return { svg };
  }
  return {};
}

async function openImportPage() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.latestCapture);
  const importUrl = result[STORAGE_KEYS.latestCapture]?.backend?.importUrl;

  if (!importUrl) {
    throw new Error("No uploaded capture is ready yet.");
  }

  await chrome.tabs.create({
    url: importUrl
  });
}

async function pingBackend() {
  const backendUrl = await getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/health`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Backend is unavailable.");
    }
    return payload;
  } catch (error) {
    throw new Error(formatFetchError(error, backendUrl));
  }
}

async function getBackendUrl() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.backendUrl);
  const storedUrl = result[STORAGE_KEYS.backendUrl] || DEFAULT_BACKEND_URL;
  const normalizedUrl = normalizeBackendUrl(storedUrl);

  if (normalizedUrl !== storedUrl) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.backendUrl]: normalizedUrl
    });
  }

  return normalizedUrl;
}

async function downloadExport(payload) {
  const { filename, content, mimeType } = payload || {};
  if (!filename || !content || !mimeType) {
    throw new Error("Missing download payload.");
  }

  const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  return chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true
  });
}

function normalizeBackendUrl(value) {
  const rawValue = String(value || "").trim();
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawValue)
    ? rawValue
    : `http://${rawValue}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(withProtocol || DEFAULT_BACKEND_URL);
  } catch (error) {
    return DEFAULT_BACKEND_URL;
  }

  const normalized = `${parsedUrl.protocol}//${parsedUrl.host}`.replace(/\/+$/, "");
  if (!normalized || normalized === "http://127.0.0.1:3210") {
    return DEFAULT_BACKEND_URL;
  }
  if (!DEFAULT_BACKEND_URL.includes("localhost") && /localhost|127\.0\.0\.1/.test(parsedUrl.hostname)) {
    return DEFAULT_BACKEND_URL;
  }
  return normalized;
}

function formatFetchError(error, backendUrl) {
  if (error?.message === "Failed to fetch") {
    return `Could not reach ${backendUrl}. Start the backend with npm run dev:backend, then click Check Backend.`;
  }
  return error?.message || "Backend request failed.";
}
