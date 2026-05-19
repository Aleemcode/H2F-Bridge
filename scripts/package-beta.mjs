import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const distDir = path.join(root, "dist");
const packageDir = path.join(distDir, "html-to-figma-beta");
const extensionZip = path.join(distDir, "html-to-figma-extension-beta.zip");
const productionBackendUrl = normalizeBackendUrl(readArg("--backend") || process.env.PUBLIC_BACKEND_URL || "");
const isProductionPackage = Boolean(productionBackendUrl);

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(packageDir, { recursive: true });

copyDirectory("extension", path.join(packageDir, "extension"));
copyDirectory("figma-plugin", path.join(packageDir, "figma-plugin"));
copyDirectory("backend", path.join(packageDir, "backend"), (relativePath) => {
  return !relativePath.startsWith(".data");
});
copyDirectory("shared", path.join(packageDir, "shared"));
copyDirectory("scripts", path.join(packageDir, "scripts"));
copyFile("package.json", path.join(packageDir, "package.json"));
copyFile("README.md", path.join(packageDir, "README.md"));
copyFile("BETA_LAUNCH.md", path.join(packageDir, "BETA_LAUNCH.md"));
copyFile("render.yaml", path.join(packageDir, "render.yaml"));

if (isProductionPackage) {
  applyProductionExtensionConfig(path.join(packageDir, "extension"), productionBackendUrl);
  applyProductionFigmaConfig(path.join(packageDir, "figma-plugin"), productionBackendUrl);
}

fs.rmSync(extensionZip, { force: true });
execFileSync("zip", ["-qr", extensionZip, "."], {
  cwd: path.join(packageDir, "extension")
});

console.log(`Created ${path.relative(root, packageDir)}`);
console.log(`Created ${path.relative(root, extensionZip)}`);
if (isProductionPackage) {
  console.log(`Production backend: ${productionBackendUrl}`);
} else {
  console.log("No --backend URL supplied; generated local-development beta package.");
}

function applyProductionExtensionConfig(extensionDir, backendUrl) {
  const manifestPath = path.join(extensionDir, "manifest.json");
  const configPath = path.join(extensionDir, "config.js");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const backendPattern = `${backendUrl}/*`;

  manifest.name = "HTML to Figma Bridge";
  manifest.description = "Capture live webpages and import them into Figma as editable frames, text, images, and vectors.";
  manifest.host_permissions = unique([
    "<all_urls>",
    backendPattern
  ]);

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    configPath,
    `globalThis.HTML_TO_FIGMA_CONFIG = {\n  backendUrl: ${JSON.stringify(backendUrl)}\n};\n`,
    "utf8"
  );
}

function applyProductionFigmaConfig(pluginDir, backendUrl) {
  const manifestPath = path.join(pluginDir, "manifest.json");
  const codePath = path.join(pluginDir, "code.js");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const code = fs.readFileSync(codePath, "utf8");

  manifest.id = "html-to-figma-bridge";
  manifest.networkAccess = {
    allowedDomains: [backendUrl],
    devAllowedDomains: ["http://localhost:3210"]
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    codePath,
    code.replace(
      /const DEFAULT_BACKEND_URL = ".*?";/,
      `const DEFAULT_BACKEND_URL = ${JSON.stringify(backendUrl)};`
    ),
    "utf8"
  );
}

function copyDirectory(sourceRelative, target, shouldCopy = () => true) {
  const source = path.join(root, sourceRelative);
  if (!fs.existsSync(source)) {
    return;
  }

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const relativePath = path.relative(source, sourcePath);

    if (!shouldCopy(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(path.relative(root, sourcePath), targetPath, shouldCopy);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function copyFile(sourceRelative, target) {
  const source = path.join(root, sourceRelative);
  if (!fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function readArg(name) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1] || "";
  }

  return "";
}

function normalizeBackendUrl(value) {
  const rawValue = String(value || "").trim().replace(/\/+$/, "");
  if (!rawValue) {
    return "";
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;

  const parsed = new URL(withProtocol);
  return `${parsed.protocol}//${parsed.host}`;
}

function unique(values) {
  return Array.from(new Set(values));
}
