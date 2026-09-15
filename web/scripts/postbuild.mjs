// Post-build: keep the standalone Capsule/7 portal available alongside the app.
//
// The React SPA (now in the Capsule/7 design) is the real product and stays at
// the site root (dist/index.html). The self-contained, dependency-free portal
// (web/capsule-portal.html) is a pure front-end demo — we publish it at
// /demo.html so it's reachable without affecting the live app.
import { copyFileSync, existsSync } from 'node:fs';

const portal = new URL('../capsule-portal.html', import.meta.url);
const demoHtml = new URL('../dist/demo.html', import.meta.url);

if (!existsSync(portal)) {
  console.log('[postbuild] capsule-portal.html not found — skipping demo copy');
  process.exit(0);
}

copyFileSync(portal, demoHtml);
console.log('[postbuild] root "/" → React app (Capsule/7) · standalone demo at "/demo.html"');
