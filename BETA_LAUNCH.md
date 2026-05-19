# HTML to Figma Bridge Beta Launch

This beta is meant for designers who are comfortable testing a local tool and sharing fidelity feedback.

## What Testers Get

- Browser extension for capturing a live webpage or selected element.
- Local backend for converting captures into a Figma-ready design model.
- Figma plugin for importing recent captures into the open Figma file.
- Local landing page at `http://localhost:3210/`.

## Tester Setup

1. Install Node.js 20 or newer.
2. Unzip the beta package.
3. Open a terminal in the package folder.
4. Run `npm run dev:backend`.
5. Open `chrome://extensions`.
6. Enable Developer mode.
7. Click Load unpacked and select the `extension` folder.
8. Open Figma and import a local plugin from `figma-plugin/manifest.json`.
9. In the browser extension, set the backend URL to `http://localhost:3210`.
10. Capture a page, then open the Figma plugin and click Refresh.

## What Feedback To Ask For

- Which pages imported with usable layer hierarchy?
- Which images, icons, shadows, or fonts drifted?
- Did the result feel editable in Figma?
- Which parts needed manual cleanup?
- Which capture failed, and what URL/page type was it?

## Privacy Notes For Beta

- Capture is user-triggered only.
- Testers should avoid capturing passwords, payment screens, private customer data, and sensitive internal dashboards.
- The local backend stores captures in `backend/.data/captures`.
- Testers can delete that folder to remove local captures.
- Do not ask testers to submit private captures unless they explicitly agree.

## Packaging

Run:

```bash
npm run package:beta
```

For hosted beta/review builds, pass the production backend URL:

```bash
npm run package:beta -- --backend=https://your-backend.example.com
```

Outputs:

- `dist/html-to-figma-beta/` full local beta package.
- `dist/html-to-figma-extension-beta.zip` Chrome extension zip for manual sharing.
- `dist/html-to-figma-beta/figma-plugin/` production-patched Figma plugin folder when `--backend` is supplied.

## Store Submission Flow

1. Deploy the backend to Render or another HTTPS host.
2. Set `PUBLIC_BACKEND_URL` to the deployed HTTPS origin.
3. Set `CAPTURE_RETENTION_HOURS` to your retention window, for example `168`.
4. Run `npm run package:beta -- --backend=https://your-backend.example.com`.
5. Upload `dist/html-to-figma-extension-beta.zip` to the Chrome Web Store.
6. In Figma, publish from `dist/html-to-figma-beta/figma-plugin/`.
7. Use the hosted `/privacy` and `/terms` pages for review links, replacing beta wording with final legal details before broad public launch.

## Launch Positioning

Suggested alpha positioning:

> Capture web pages into editable Figma layers. Built for designers who want native frames, text, images, SVGs, and auto-layout candidates instead of one flat screenshot.

Avoid promising pixel-perfect import yet. Use language like "editable structure," "high-fidelity beta," and "improving landing-page fidelity."
