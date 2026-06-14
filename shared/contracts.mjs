export const APP_VERSION = "0.3.0";
export const DEFAULT_BACKEND_URL = "http://localhost:3210";

export const STORAGE_KEYS = {
  backendUrl: "htmlToDesign:backendUrl",
  latestCapture: "htmlToDesign:latestCapture"
};

export function createCaptureEnvelope(capture, backend = {}) {
  return {
    appVersion: APP_VERSION,
    capture,
    backend,
    updatedAt: new Date().toISOString()
  };
}

export function buildDownloadFilename(extension, title = "capture") {
  const safeTitle = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "capture";

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `html-to-figma-${safeTitle}-${stamp}.${extension}`;
}

export function clipText(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

export function summarizeCapture(capture) {
  const nodeCount = Array.isArray(capture?.nodes) ? capture.nodes.length : 0;
  const assetCount = Array.isArray(capture?.assets) ? capture.assets.length : 0;
  return {
    id: capture?.capture?.id || null,
    title: capture?.capture?.title || "Untitled page",
    url: capture?.capture?.sourceUrl || "",
    mode: capture?.capture?.mode || "page",
    nodeCount,
    assetCount,
    frame: capture?.capture?.frame || null,
    capturedAt: capture?.capture?.capturedAt || null
  };
}
