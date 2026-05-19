# Hosted Beta Deployment

Recommended v1 hosted architecture:

```text
Vercel marketing site
  |
  | links to install/onboarding
  v
Chrome extension -> Node converter backend -> Figma plugin
                         |
                         v
                 Supabase later for auth,
                 capture metadata, storage
```

## 1. Vercel Website

The marketing website lives in `site/` and is generated from `backend/public`.

From the repo root:

```bash
npm run site:build
```

For Vercel:

- Project root: `site`
- Build command: `npm run build`
- Output directory: `public`

The site serves:

- `/`
- `/privacy`
- `/terms`

## 2. Converter Backend

Keep the converter backend as a Node web service for v1. Render, Fly.io, Railway, or a small VPS are all fine.

One-click Render Blueprint:

[Deploy backend to Render](https://render.com/deploy?repo=https://github.com/Aleemcode/H2F-Bridge)

Required environment variables:

```text
PUBLIC_BACKEND_URL=https://your-backend.example.com
CAPTURE_RETENTION_HOURS=168
```

Render is already configured in `render.yaml`.

## 3. Supabase

Use Supabase in phases. Do not move the converter there yet.

Phase 1:

- Create a Supabase project.
- Reserve environment variables for future auth/storage integration.
- Keep capture storage in the Node backend while beta feedback starts.

Phase 2:

- Use Supabase Auth for accounts.
- Store capture metadata in Postgres.
- Store large capture JSON/assets in Supabase Storage.
- Keep conversion in the Node backend.

Suggested future environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_CAPTURE_BUCKET=captures
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the extension, Figma plugin, or Vercel frontend.

## 4. Store Packages

After the backend is deployed:

```bash
npm run package:beta -- --backend=https://your-backend.example.com
```

Outputs:

- Chrome Web Store zip: `dist/html-to-figma-extension-beta.zip`
- Figma plugin folder: `dist/html-to-figma-beta/figma-plugin`

## 5. Chrome Web Store

Recommended first release:

- Visibility: Unlisted
- Category: Developer Tools or Productivity
- Permissions explanation: active tab capture, storage for settings, downloads for debug exports, scripting for page capture.
- Privacy policy URL: `https://your-site.example.com/privacy`

## 6. Figma Community

Use the production-patched plugin folder:

```text
dist/html-to-figma-beta/figma-plugin
```

The generated `manifest.json` will include:

```json
"networkAccess": {
  "allowedDomains": ["https://your-backend.example.com"]
}
```

## 7. Beta Safety

- Keep captures temporary.
- Tell testers not to capture passwords, payments, customer data, or confidential dashboards.
- Keep the listing language honest: editable structure, beta fidelity, native Figma import.
- Avoid promising pixel-perfect import until regression captures prove it.
