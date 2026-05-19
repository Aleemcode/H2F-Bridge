import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "extension/manifest.json",
  "extension/config.js",
  "extension/background.js",
  "extension/content.js",
  "extension/content.css",
  "extension/popup.html",
  "extension/popup.css",
  "extension/popup.js",
  "backend/server.mjs",
  "backend/public/index.html",
  "backend/public/privacy.html",
  "backend/public/terms.html",
  "backend/public/styles.css",
  "backend/public/app.js",
  "DEPLOYMENT.md",
  "shared/contracts.mjs",
  "shared/converter.mjs",
  "figma-plugin/manifest.json",
  "figma-plugin/code.js",
  "figma-plugin/ui.html",
  "README.md",
  "package.json",
  "site/package.json",
  "site/vercel.json",
  "scripts/build-site.mjs"
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error("Missing required files:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

checkJson("extension/manifest.json");
checkJson("figma-plugin/manifest.json");
checkJson("package.json");
checkJson("site/package.json");
checkJson("site/vercel.json");

const manifest = readJson("extension/manifest.json");
if (manifest.manifest_version !== 3) {
  throw new Error("Extension manifest must use version 3.");
}

const hostPermissions = new Set(manifest.host_permissions || []);
for (const host of ["http://localhost:3210/*"]) {
  if (!hostPermissions.has(host)) {
    throw new Error(`Missing host permission: ${host}`);
  }
}

const pluginManifest = readJson("figma-plugin/manifest.json");
if (pluginManifest.main !== "code.js" || pluginManifest.ui !== "ui.html") {
  throw new Error("Figma plugin manifest must point to code.js and ui.html.");
}

if (pluginManifest.networkAccess?.allowedDomains?.[0] !== "none") {
  throw new Error("Figma plugin allowedDomains must be ['none'] for local development.");
}

if (!pluginManifest.networkAccess?.devAllowedDomains?.includes("http://localhost:3210")) {
  throw new Error("Figma plugin devAllowedDomains must include http://localhost:3210.");
}

const figmaPluginCode = fs.readFileSync(path.join(root, "figma-plugin/code.js"), "utf8");
if (/\?\.|\?\?/.test(figmaPluginCode)) {
  throw new Error("Figma plugin code must avoid optional chaining and nullish coalescing for runtime compatibility.");
}

const syntaxFiles = [
  "extension/background.js",
  "extension/content.js",
  "extension/popup.js",
  "backend/server.mjs",
  "shared/contracts.mjs",
  "shared/converter.mjs",
  "figma-plugin/code.js",
  "scripts/test-backend.mjs",
  "scripts/package-beta.mjs",
  "scripts/build-site.mjs"
];

for (const file of syntaxFiles) {
  execFileSync("node", ["--check", file], {
    cwd: root,
    stdio: "pipe"
  });
}

console.log("Validation passed.");
console.log(`Checked ${requiredFiles.length} required files.`);

function checkJson(relativePath) {
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
