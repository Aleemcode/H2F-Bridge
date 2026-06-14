/**
 * Pillar 3 — Visual-fidelity regression harness.
 *
 * Instead of eyeballing one site at a time, this computes objective fidelity
 * metrics over a captured design model and fails when they fall below
 * thresholds. Run it across a corpus of sites to catch regressions in whole
 * bug classes (invisible text, missing auto-layout, broken images) at once.
 *
 * Usage:
 *   node scripts/fidelity-check.mjs <captureId> [<captureId> ...]
 *   node scripts/fidelity-check.mjs --file ./capture.json
 *   node scripts/fidelity-check.mjs --url https://example.com   (alias: looks up
 *                                    recent captures whose sourceUrl matches)
 *
 * Environment:
 *   BACKEND_URL   defaults to the hosted Render backend.
 *
 * Exit code is non-zero if any site breaches a threshold (CI-friendly).
 */

import fs from "node:fs";
import { buildDesignModel } from "../shared/converter.mjs";

const BACKEND_URL = (
  process.env.BACKEND_URL || "https://html-to-figma-backend-qrnq.onrender.com"
).replace(/\/+$/, "");

// Quality gates. Tune as the tool improves.
const THRESHOLDS = {
  maxInvisibleTextRatio: 0.05, // ≤5% of text nodes may be invisible
  maxBrokenImageRatio: 0.1,    // ≤10% of images may be unresolved
  minAutoLayoutCoverage: 0.6,  // ≥60% of multi-child frames should auto-lay-out
  maxFallbackNodes: 0          // no "Unsupported:" fallback nodes
};

main().catch((error) => {
  console.error("fidelity-check failed:", error.message);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsageAndExit();
  }

  const models = await resolveModels(args);
  if (models.length === 0) {
    console.error("No design models resolved from the given arguments.");
    process.exit(1);
  }

  let anyFailed = false;
  for (const { label, model } of models) {
    const metrics = analyzeModel(model);
    const failures = evaluate(metrics);
    report(label, metrics, failures);
    if (failures.length > 0) {
      anyFailed = true;
    }
  }

  process.exit(anyFailed ? 1 : 0);
}

async function resolveModels(args) {
  const models = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--file") {
      const filePath = args[++index];
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      models.push({ label: filePath, model: toModel(raw) });
      continue;
    }

    if (arg === "--url") {
      const url = args[++index];
      const recent = await fetchJson(`${BACKEND_URL}/captures/recent`);
      const match = (recent.captures || []).find((capture) => capture.url === url);
      if (!match) {
        console.error(`No recent capture found for URL: ${url}`);
        continue;
      }
      const model = await fetchJson(`${BACKEND_URL}/captures/${match.captureId}/design-model`);
      models.push({ label: `${url} (${match.captureId})`, model });
      continue;
    }

    // Bare argument = captureId on the backend.
    const model = await fetchJson(`${BACKEND_URL}/captures/${arg}/design-model`);
    models.push({ label: arg, model });
  }

  return models;
}

// Accept either a design model (has `root`) or a raw capture package (has
// `nodes`) and normalize to a design model.
function toModel(raw) {
  if (raw && raw.root) {
    return raw;
  }
  if (raw && Array.isArray(raw.nodes)) {
    return buildDesignModel(raw);
  }
  throw new Error("Input is neither a design model nor a capture package.");
}

function analyzeModel(model) {
  const metrics = {
    totalNodes: 0,
    textNodes: 0,
    invisibleText: 0,
    imageNodes: 0,
    brokenImages: 0,
    embeddedImages: 0,
    gradientFills: 0,
    multiChildFrames: 0,
    autoLayoutFrames: 0,
    fallbackNodes: 0
  };

  walk(model.root, metrics);
  return metrics;
}

function walk(node, metrics) {
  if (!node) {
    return;
  }
  metrics.totalNodes += 1;

  if (typeof node.name === "string" && node.name.startsWith("Unsupported")) {
    metrics.fallbackNodes += 1;
  }

  if (node.type === "text") {
    metrics.textNodes += 1;
    if (isInvisibleFill(node.fills)) {
      metrics.invisibleText += 1;
    }
  }

  if (node.type === "image") {
    metrics.imageNodes += 1;
    const url = node.imageUrl || node.proxiedImageUrl || "";
    if (!url) {
      metrics.brokenImages += 1;
    } else if (url.startsWith("data:")) {
      metrics.embeddedImages += 1;
    }
  }

  if (Array.isArray(node.fills)) {
    metrics.gradientFills += node.fills.filter(
      (fill) => fill && typeof fill.type === "string" && fill.type.startsWith("GRADIENT")
    ).length;
  }

  if (node.type === "frame" && Array.isArray(node.children)) {
    const realChildren = node.children.filter((child) => !child.isAbsolute);
    if (realChildren.length >= 2) {
      metrics.multiChildFrames += 1;
      if (node.autoLayout || node.gridLayout) {
        metrics.autoLayoutFrames += 1;
      }
    }
    for (const child of node.children) {
      walk(child, metrics);
    }
  }
}

function isInvisibleFill(fills) {
  if (!Array.isArray(fills) || fills.length === 0) {
    return true;
  }
  return fills.every((fill) => {
    if (fill && typeof fill.type === "string" && fill.type.startsWith("GRADIENT")) {
      return false;
    }
    return fill && typeof fill.a === "number" && fill.a <= 0.01;
  });
}

function evaluate(metrics) {
  const failures = [];

  const invisibleRatio = ratio(metrics.invisibleText, metrics.textNodes);
  if (invisibleRatio > THRESHOLDS.maxInvisibleTextRatio) {
    failures.push(
      `invisible text ${pct(invisibleRatio)} > ${pct(THRESHOLDS.maxInvisibleTextRatio)}`
    );
  }

  const brokenRatio = ratio(metrics.brokenImages, metrics.imageNodes);
  if (brokenRatio > THRESHOLDS.maxBrokenImageRatio) {
    failures.push(
      `broken images ${pct(brokenRatio)} > ${pct(THRESHOLDS.maxBrokenImageRatio)}`
    );
  }

  const autoCoverage = ratio(metrics.autoLayoutFrames, metrics.multiChildFrames);
  if (metrics.multiChildFrames > 0 && autoCoverage < THRESHOLDS.minAutoLayoutCoverage) {
    failures.push(
      `auto-layout coverage ${pct(autoCoverage)} < ${pct(THRESHOLDS.minAutoLayoutCoverage)}`
    );
  }

  if (metrics.fallbackNodes > THRESHOLDS.maxFallbackNodes) {
    failures.push(`${metrics.fallbackNodes} fallback node(s) > ${THRESHOLDS.maxFallbackNodes}`);
  }

  return failures;
}

function report(label, metrics, failures) {
  const status = failures.length === 0 ? "PASS" : "FAIL";
  console.log(`\n=== ${label} — ${status} ===`);
  console.log(`  nodes:            ${metrics.totalNodes}`);
  console.log(
    `  text:             ${metrics.textNodes} (${metrics.invisibleText} invisible, ${pct(ratio(metrics.invisibleText, metrics.textNodes))})`
  );
  console.log(
    `  images:           ${metrics.imageNodes} (${metrics.embeddedImages} embedded, ${metrics.brokenImages} broken)`
  );
  console.log(`  gradient fills:   ${metrics.gradientFills}`);
  console.log(
    `  auto-layout:      ${metrics.autoLayoutFrames}/${metrics.multiChildFrames} multi-child frames (${pct(ratio(metrics.autoLayoutFrames, metrics.multiChildFrames))})`
  );
  console.log(`  fallback nodes:   ${metrics.fallbackNodes}`);
  if (failures.length > 0) {
    console.log(`  ✗ ${failures.join("\n  ✗ ")}`);
  }
}

function ratio(part, whole) {
  return whole > 0 ? part / whole : 0;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${url}`);
  }
  return payload;
}

function printUsageAndExit() {
  console.log("Usage:");
  console.log("  node scripts/fidelity-check.mjs <captureId> [<captureId> ...]");
  console.log("  node scripts/fidelity-check.mjs --file ./capture.json");
  console.log("  node scripts/fidelity-check.mjs --url https://example.com");
  process.exit(1);
}
