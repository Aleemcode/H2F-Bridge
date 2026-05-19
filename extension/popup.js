const DEFAULT_BACKEND_URL = globalThis.HTML_TO_FIGMA_CONFIG?.backendUrl || "http://localhost:3210";
const STORAGE_KEYS = {
  backendUrl: "htmlToDesign:backendUrl",
  latestCapture: "htmlToDesign:latestCapture"
};

const MESSAGE_CAPTURE_PAGE = "html-to-figma/capture-page";
const MESSAGE_START_SELECTION = "html-to-figma/start-selection";
const MESSAGE_CONTENT_PING = "html-to-figma/content-ping";
const MESSAGE_DOWNLOAD_EXPORT = "html-to-figma/download-export";
const MESSAGE_OPEN_IMPORT = "html-to-figma/open-import";
const MESSAGE_BACKEND_HEALTH = "html-to-figma/backend-health";

const elements = {
  status: document.getElementById("status"),
  captureTitle: document.getElementById("capture-title"),
  captureMode: document.getElementById("capture-mode"),
  captureNodes: document.getElementById("capture-nodes"),
  captureBackend: document.getElementById("capture-backend"),
  capturePage: document.getElementById("capture-page"),
  captureSelection: document.getElementById("capture-selection"),
  sendToFigma: document.getElementById("send-to-figma"),
  refreshBackend: document.getElementById("refresh-backend"),
  backendUrl: document.getElementById("backend-url"),
  saveBackend: document.getElementById("save-backend"),
  copyJson: document.getElementById("copy-json"),
  copySvg: document.getElementById("copy-svg"),
  downloadJson: document.getElementById("download-json"),
  downloadSvg: document.getElementById("download-svg")
};

let latestRecord = null;

boot();

async function boot() {
  bindEvents();
  await loadSettings();
  await refreshCapture();
}

function bindEvents() {
  elements.capturePage.addEventListener("click", async () => {
    setStatus("Capturing current page and sending it to the backend...");
    const response = await sendToActiveTab({ type: MESSAGE_CAPTURE_PAGE });
    if (!response?.ok) {
      setStatus(response?.error || "Capture failed.");
      return;
    }

    setStatus("Capture complete. Upload is in progress.");
    await refreshCapture();
  });

  elements.captureSelection.addEventListener("click", async () => {
    setStatus("Selection mode armed. Click an element on the page.");
    const response = await sendToActiveTab({ type: MESSAGE_START_SELECTION });
    if (!response?.ok) {
      setStatus(response?.error || "Could not start selection mode.");
      return;
    }
  });

  elements.sendToFigma.addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_OPEN_IMPORT });
    if (!response?.ok) {
      setStatus(response?.error || "No uploaded capture is ready yet.");
      return;
    }
    setStatus("Import page opened. Switch to the Figma plugin and refresh recent captures.");
  });

  elements.refreshBackend.addEventListener("click", async () => {
    setStatus("Checking local backend...");
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_BACKEND_HEALTH });
    setStatus(response?.ok ? `Backend ready at ${response.payload.backendUrl}.` : response?.error || "Backend unavailable.");
    renderBackendBadge(response?.ok ? "ready" : "error");
  });

  elements.saveBackend.addEventListener("click", async () => {
    const backendUrl = normalizeBackendUrl(elements.backendUrl.value);
    await chrome.storage.local.set({
      [STORAGE_KEYS.backendUrl]: backendUrl
    });
    elements.backendUrl.value = backendUrl;
    setStatus(`Saved backend URL: ${backendUrl}`);
  });

  elements.copyJson.addEventListener("click", async () => {
    if (!latestRecord?.capture) {
      return;
    }
    const capturePackage = await resolveCapturePackageForExport();
    await navigator.clipboard.writeText(JSON.stringify(capturePackage, null, 2));
    setStatus("Capture JSON copied.");
  });

  elements.copySvg.addEventListener("click", async () => {
    const svg = latestRecord?.capture?.debug?.svg;
    if (!svg) {
      return;
    }
    await navigator.clipboard.writeText(svg);
    setStatus("Debug SVG copied.");
  });

  elements.downloadJson.addEventListener("click", async () => {
    if (!latestRecord?.capture) {
      return;
    }
    const capturePackage = await resolveCapturePackageForExport();
    await chrome.runtime.sendMessage({
      type: MESSAGE_DOWNLOAD_EXPORT,
      payload: {
        filename: buildFilename("json", capturePackage.capture.title),
        content: JSON.stringify(capturePackage, null, 2),
        mimeType: "application/json"
      }
    });
    setStatus("Capture JSON download started.");
  });

  elements.downloadSvg.addEventListener("click", async () => {
    const svg = latestRecord?.capture?.debug?.svg;
    if (!svg) {
      return;
    }
    await chrome.runtime.sendMessage({
      type: MESSAGE_DOWNLOAD_EXPORT,
      payload: {
        filename: buildFilename("svg", latestRecord.capture.capture.title),
        content: svg,
        mimeType: "image/svg+xml"
      }
    });
    setStatus("Debug SVG download started.");
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[STORAGE_KEYS.latestCapture]) {
      latestRecord = changes[STORAGE_KEYS.latestCapture].newValue ?? null;
      renderCapture();
    }

    if (changes[STORAGE_KEYS.backendUrl]) {
      elements.backendUrl.value = changes[STORAGE_KEYS.backendUrl].newValue || DEFAULT_BACKEND_URL;
    }
  });
}

async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.backendUrl);
  const normalizedUrl = normalizeBackendUrl(result[STORAGE_KEYS.backendUrl] || DEFAULT_BACKEND_URL);
  elements.backendUrl.value = normalizedUrl;

  if (normalizedUrl !== result[STORAGE_KEYS.backendUrl]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.backendUrl]: normalizedUrl
    });
  }
}

async function refreshCapture() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.latestCapture);
  latestRecord = result[STORAGE_KEYS.latestCapture] ?? null;
  renderCapture();
}

function renderCapture() {
  const hasCapture = Boolean(latestRecord?.capture);
  const debugSvg = latestRecord?.capture?.debug?.svg;

  elements.sendToFigma.disabled = !latestRecord?.backend?.importUrl;
  elements.copyJson.disabled = !hasCapture;
  elements.copySvg.disabled = !debugSvg;
  elements.downloadJson.disabled = !hasCapture;
  elements.downloadSvg.disabled = !debugSvg;

  if (!hasCapture) {
    elements.captureMode.textContent = "No capture";
    elements.captureNodes.textContent = "-";
    renderBackendBadge("offline");
    elements.captureTitle.textContent = "Waiting for your first capture.";
    return;
  }

  const { capture, backend } = latestRecord;
  elements.captureMode.textContent = capture.capture.mode === "selection" ? "Selection" : "Full page";
  elements.captureNodes.textContent = `${capture.nodes?.length ?? capture.nodeCount ?? backend?.preview?.nodeCount ?? "-"}`;
  renderBackendBadge(backend?.status || "offline");
  elements.captureTitle.textContent = capture.capture.title || capture.capture.sourceUrl;

  if (backend?.status === "error") {
    setStatus(`Upload failed: ${backend.error}`);
  }
}

async function resolveCapturePackageForExport() {
  if (Array.isArray(latestRecord?.capture?.nodes)) {
    return latestRecord.capture;
  }

  const backendUrl = latestRecord?.backend?.backendUrl || DEFAULT_BACKEND_URL;
  const captureId = latestRecord?.backend?.captureId;
  if (!captureId) {
    return latestRecord.capture;
  }

  const response = await fetch(`${backendUrl}/captures/${captureId}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Could not load capture JSON from backend.");
  }
  return payload;
}

function renderBackendBadge(status) {
  if (status === "ready") {
    elements.captureBackend.textContent = "Ready";
    return;
  }
  if (status === "uploading") {
    elements.captureBackend.textContent = "Uploading";
    return;
  }
  if (status === "error") {
    elements.captureBackend.textContent = "Error";
    return;
  }
  elements.captureBackend.textContent = "Offline";
}

function setStatus(message) {
  elements.status.textContent = message;
}

async function sendToActiveTab(message) {
  try {
    const tab = await getActiveTab();

    if (!tab?.id) {
      return { ok: false, error: "No active website tab found. Click the page you want to capture, then reopen this extension." };
    }

    if (isRestrictedTabUrl(tab.url)) {
      return {
        ok: false,
        error: `Chrome blocks capture on this tab (${tab.url || "unknown URL"}). Open a normal website tab and try again.`
      };
    }

    return await sendMessageWithContentScriptRetry(tab, message);
  } catch (error) {
    return {
      ok: false,
      error: formatTabCaptureError(error)
    };
  }
}

async function getActiveTab() {
  const [lastFocusedTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (lastFocusedTab?.id) {
    return lastFocusedTab;
  }

  const [currentWindowTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
  });

  return currentWindowTab || null;
}

async function sendMessageWithContentScriptRetry(tab, message) {
  const ping = await pingContentScript(tab.id);
  if (ping?.ok) {
    return chrome.tabs.sendMessage(tab.id, message);
  }

  setStatus("Preparing this tab for capture...");
  await injectContentScript(tab.id);
  await wait(75);

  const retryPing = await pingContentScript(tab.id);
  if (!retryPing?.ok) {
    throw new Error(retryPing?.error || "Content script injected, but the page did not respond. Refresh this website tab and try again.");
  }

  return chrome.tabs.sendMessage(tab.id, message);
}

async function pingContentScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: MESSAGE_CONTENT_PING });
  } catch (error) {
    if (isMissingContentScriptError(error)) {
      return { ok: false, error: "Content script is not active on this tab yet." };
    }
    return { ok: false, error: formatTabCaptureError(error) };
  }
}

async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function isMissingContentScriptError(error) {
  return String(error?.message || error).includes("Receiving end does not exist");
}

function isRestrictedTabUrl(url) {
  if (!url) {
    return true;
  }

  return /^(about|chrome|chrome-extension|edge|brave|opera|vivaldi):/i.test(url)
    || url.startsWith("https://chromewebstore.google.com/")
    || url.startsWith("https://chrome.google.com/webstore/");
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatTabCaptureError(error) {
  const message = String(error?.message || error);
  if (message.includes("Cannot access") || message.includes("chrome://") || message.includes("extensions gallery")) {
    return "This page blocks extension capture. Open a normal website tab, refresh it, then capture again.";
  }
  if (message.includes("Missing host permission")) {
    return "Chrome needs this site permission. Reload the extension and refresh the page, then capture again.";
  }
  return message || "This page does not allow extension capture. Try a regular website tab.";
}

function buildFilename(extension, title) {
  const safeTitle = String(title || "capture")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "capture";

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `html-to-figma-${safeTitle}-${stamp}.${extension}`;
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
