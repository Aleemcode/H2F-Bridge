/**
 * HTML-to-Figma MCP Server
 *
 * Exposes the capture pipeline as MCP tools so any AI agent (Claude, etc.)
 * can capture a URL or push HTML directly into Figma without needing the
 * Chrome extension or running a local backend manually.
 *
 * Tools:
 *   list_captures        — list recent captures stored by the backend
 *   get_capture          — fetch the full design-model JSON for a capture
 *   import_capture       — tell the Figma plugin to import a stored capture
 *   push_capture_json    — push raw capture JSON directly into the backend
 *
 * Usage:
 *   node mcp-server/index.mjs
 *
 * Environment variables:
 *   BACKEND_URL   — defaults to http://localhost:3210
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:3210").replace(/\/+$/, "");

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_captures",
    description:
      "List the most recent HTML captures stored by the backend. Returns up to 20 captures with their IDs, page titles, source URLs, node/asset counts, and import URLs.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_capture",
    description:
      "Fetch the full Figma design-model JSON for a specific capture. The design model contains the complete node tree ready for import into Figma.",
    inputSchema: {
      type: "object",
      properties: {
        captureId: {
          type: "string",
          description: "The capture ID returned by list_captures or push_capture_json."
        }
      },
      required: ["captureId"]
    }
  },
  {
    name: "push_capture_json",
    description:
      "Push a raw capture package (nodes + assets + metadata) directly into the backend. Returns the captureId, importUrl and a preview summary. Use this when you already have a capture JSON payload and want to store it for Figma import without going through the Chrome extension.",
    inputSchema: {
      type: "object",
      properties: {
        capture: {
          type: "object",
          description: "Capture metadata: { id, title, sourceUrl, mode, frame, capturedAt, rootNodeId }"
        },
        nodes: {
          type: "array",
          description: "Array of serialized DOM nodes produced by the extension's content script."
        },
        assets: {
          type: "array",
          description: "Optional array of image/SVG assets referenced by the nodes."
        },
        appVersion: {
          type: "string",
          description: "Optional app version string."
        }
      },
      required: ["capture", "nodes"]
    }
  },
  {
    name: "backend_health",
    description:
      "Check whether the HTML-to-Figma backend is running and reachable. Returns the backend URL, app version, and capture retention policy.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// ── Tool handlers ──────────────────────────────────────────────────────────

async function handleListCaptures() {
  const response = await backendFetch("/captures/recent");
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to list captures.");
  }

  const captures = payload.captures || [];
  if (captures.length === 0) {
    return text("No captures found. Use the Chrome extension to capture a page first, or call push_capture_json.");
  }

  const lines = captures.map((capture, index) =>
    [
      `${index + 1}. ${capture.title || "Untitled"} (${capture.captureId})`,
      `   URL: ${capture.url || "—"}`,
      `   Mode: ${capture.mode || "page"} | Nodes: ${capture.nodeCount} | Assets: ${capture.assetCount}`,
      `   Captured: ${capture.createdAt || "unknown"}`,
      `   Import URL: ${capture.importUrl}`
    ].join("\n")
  );

  return text(`Found ${captures.length} capture(s):\n\n${lines.join("\n\n")}`);
}

async function handleGetCapture({ captureId }) {
  if (!captureId) {
    throw new Error("captureId is required.");
  }

  const response = await backendFetch(`/captures/${captureId}/design-model`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Capture ${captureId} not found.`);
  }

  return text(JSON.stringify(payload, null, 2));
}

async function handlePushCaptureJson({ capture, nodes, assets, appVersion }) {
  if (!capture?.id) {
    // Auto-generate an ID if none was provided
    capture = {
      ...capture,
      id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturedAt: capture?.capturedAt || new Date().toISOString()
    };
  }

  const body = {
    appVersion: appVersion || "mcp",
    capture,
    nodes: nodes || [],
    assets: assets || []
  };

  const response = await backendFetch("/captures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Backend rejected the capture.");
  }

  return text(
    [
      "Capture stored successfully.",
      `  Capture ID : ${payload.captureId}`,
      `  Status     : ${payload.status}`,
      `  Nodes      : ${nodes.length}`,
      `  Assets     : ${(assets || []).length}`,
      `  Import URL : ${payload.importUrl}`,
      `  Design JSON: ${payload.designModelUrl}`,
      "",
      "Open the Figma plugin, click Refresh, then import this capture — or call get_capture to inspect the design model."
    ].join("\n")
  );
}

async function handleBackendHealth() {
  try {
    const response = await backendFetch("/health");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Backend returned an error.");
    }

    return text(
      [
        "Backend is healthy.",
        `  URL         : ${payload.backendUrl || BACKEND_URL}`,
        `  App version : ${payload.appVersion || "unknown"}`,
        `  Retention   : ${payload.captureRetentionHours || "?"} hours`
      ].join("\n")
    );
  } catch (error) {
    return text(
      [
        "Backend is NOT reachable.",
        `  Tried: ${BACKEND_URL}`,
        `  Error: ${error.message}`,
        "",
        "Start the backend with:  npm run dev:backend"
      ].join("\n")
    );
  }
}

// ── MCP server bootstrap ───────────────────────────────────────────────────

const server = new Server(
  { name: "html-to-figma", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "list_captures":
        return await handleListCaptures();
      case "get_capture":
        return await handleGetCapture(args);
      case "push_capture_json":
        return await handlePushCaptureJson(args);
      case "backend_health":
        return await handleBackendHealth();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[html-to-figma MCP] server started — backend: ${BACKEND_URL}`);

// ── Helpers ────────────────────────────────────────────────────────────────

function backendFetch(pathname, options = {}) {
  return fetch(`${BACKEND_URL}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(15000)
  });
}

function text(content) {
  return { content: [{ type: "text", text: String(content) }] };
}
