# HTML to Figma

This repo is now a local three-part MVP for turning live HTML into editable Figma structure:

- a browser extension that captures DOM, CSS, text, images, and inline SVG
- a local Node backend that normalizes the capture and converts it into a Figma-ready design model
- a companion Figma plugin that imports recent captures as native frames, text, images, and vectors

## What changed

The old SVG-first workflow is still available as a debug export, but it is no longer the main product path.

The primary flow is:

1. Capture a page or selection from the browser extension.
2. Upload that capture to the local backend.
3. Open the companion Figma plugin.
4. Refresh recent captures and import the latest one into your file.

## Repo structure

```text
backend/
  server.mjs
extension/
  manifest.json
  background.js
  content.js
  content.css
  popup.html
  popup.css
  popup.js
figma-plugin/
  manifest.json
  code.js
  ui.html
shared/
  contracts.mjs
  converter.mjs
scripts/
  test-backend.mjs
  validate.mjs
```

## What the extension captures

- DOM tree structure
- text nodes
- computed layout metadata
- flexbox hints for auto layout inference
- fills, borders, radii, shadows, opacity
- images
- inline SVG markup
- viewport and selection bounds

## What the backend converts

- containers into Figma-ready frame nodes
- text into editable text nodes
- images into image-fill candidates
- inline SVG into vector-import candidates
- flex layouts into inferred horizontal or vertical auto layout where appropriate

## Current v1 scope

Best supported:

- hero sections
- nav bars
- simple dashboards
- forms
- cards
- buttons
- nested flex layouts

Still limited:

- pseudo-elements
- canvas and video
- complex transforms
- advanced filters and blend modes
- perfect CSS grid fidelity
- arbitrary remote image fetching inside Figma depending on plugin network rules

## Run the backend

```bash
npm run dev:backend
```

The default local backend URL is:

```text
http://localhost:3210
```

The backend also serves the launch landing page at:

```text
http://localhost:3210/
```

## Load the browser extension

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select [extension](/Users/aleemakinyoola/Documents/htmltodesign%20plugin/extension).
5. In the popup, confirm the backend URL matches the running server.

## Load the Figma plugin

1. Open Figma Desktop or Figma in the browser.
2. Create a local plugin from manifest.
3. Choose [figma-plugin/manifest.json](/Users/aleemakinyoola/Documents/htmltodesign%20plugin/figma-plugin/manifest.json).
4. Run the plugin named `HTML to Figma Bridge`.

## Test the flow

1. Start the backend with `npm run dev:backend`.
2. Capture a normal webpage from the browser extension.
3. Click `Send to Figma` to open the local import page and confirm the upload exists.
4. Open the Figma plugin and click `Refresh`.
5. Import the recent capture into the current file.

## Validation

```bash
npm run test:backend
npm run validate
```

## Package for hosted beta

After deploying the backend to an HTTPS URL, generate production-patched extension and Figma plugin bundles with:

```bash
npm run package:beta -- --backend=https://your-backend.example.com
```

This creates:

```text
dist/html-to-figma-extension-beta.zip
dist/html-to-figma-beta/
```

Use the zip for Chrome Web Store submission and `dist/html-to-figma-beta/figma-plugin/` for Figma plugin publishing.

## Deploy the website

The launch website can be hosted separately on Vercel from the `site/` folder:

```bash
npm run site:build
```

See [DEPLOYMENT.md](/Users/aleemakinyoola/Documents/htmltodesign%20plugin/DEPLOYMENT.md) for the Vercel, backend, Supabase, Chrome Web Store, and Figma Community launch path.

## Notes

- The backend persists captures in `backend/.data/`.
- Captures can be deleted with `DELETE /captures/:id`.
- Hosted deployments can set `CAPTURE_RETENTION_HOURS` for automatic capture cleanup.
- Debug JSON and debug SVG are still available from the extension popup.
- The current importer prioritizes editable structure over pixel-perfect visual parity.
