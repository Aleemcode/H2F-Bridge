import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/inspect-make.mjs /path/to/file.make");
  process.exit(1);
}

const resolvedPath = path.resolve(inputPath);
const tempDir = path.join("/tmp", `inspect-make-${Date.now()}`);
fs.mkdirSync(tempDir, { recursive: true });

execFileSync("unzip", ["-o", resolvedPath, "-d", tempDir], {
  stdio: "ignore"
});

const metaPath = path.join(tempDir, "meta.json");
const canvasPath = path.join(tempDir, "canvas.fig");
const meta = fs.existsSync(metaPath)
  ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
  : null;
const canvas = fs.existsSync(canvasPath)
  ? fs.readFileSync(canvasPath)
  : null;

console.log(JSON.stringify({
  file: resolvedPath,
  meta,
  canvas: canvas ? inspectCanvas(canvas) : null
}, null, 2));

function inspectCanvas(canvas) {
  const header = canvas.subarray(0, 8).toString("utf8");
  const result = {
    byteLength: canvas.length,
    header,
    rawDeflateOffset: null,
    decompressedByteLength: null,
    readableTokens: []
  };

  let bestResult = null;

  for (const offset of [0, 8, 12, 16]) {
    try {
      const inflated = zlib.inflateRawSync(canvas.subarray(offset));
      const candidate = {
        rawDeflateOffset: offset,
        decompressedByteLength: inflated.length,
        readableTokens: extractReadableTokens(inflated)
      };

      if (!bestResult || scoreCandidate(candidate) > scoreCandidate(bestResult)) {
        bestResult = candidate;
      }
    } catch (error) {
      // Try the next likely header offset.
    }
  }

  if (bestResult) {
    return {
      ...result,
      ...bestResult
    };
  }

  return result;
}

function scoreCandidate(candidate) {
  return candidate.decompressedByteLength + candidate.readableTokens.length * 1000;
}

function extractReadableTokens(buffer) {
  const text = buffer.toString("latin1");
  const tokens = text.match(/[A-Za-z][A-Za-z0-9_+\-. ]{2,}/g) || [];
  const interesting = tokens.filter((token) => {
    return /^(FRAME|TEXT|VECTOR|RECTANGLE|GRID|Html|Body|Main|Aside|Nav|Header|Container|Background|Border|SVG|layout|grid|fills?|strokes?|effects?|font|Text|Node|Paint|Effect|Constraint|Axis)/i.test(token);
  });

  return [...new Set(interesting)].slice(0, 160);
}
