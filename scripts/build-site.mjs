import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sitePublicDir = path.join(root, "site", "public");
const backendPublicDir = path.join(root, "backend", "public");

fs.rmSync(sitePublicDir, { recursive: true, force: true });
fs.mkdirSync(sitePublicDir, { recursive: true });

for (const file of ["index.html", "app.js", "styles.css", "privacy.html", "terms.html"]) {
  fs.copyFileSync(
    path.join(backendPublicDir, file),
    path.join(sitePublicDir, file)
  );
}

console.log("Built site/public from backend/public.");
