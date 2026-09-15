// Post-build: promote the self-contained Capsule/7 portal to the site root.
//
// `vite build` emits the React SPA to dist/ (dist/index.html + assets). The new
// Capsule/7 multi-role portal is a standalone, dependency-free HTML file
// (web/capsule-portal.html) that isn't part of the Vite graph. Until the design
// is ported into the React app, we serve the portal at "/" and keep the real
// React SPA available at "/app.html" for the porting work.
import { copyFileSync, existsSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const portal = new URL('../capsule-portal.html', import.meta.url);
const indexHtml = new URL('index.html', dist);
const appHtml = new URL('app.html', dist);

if (!existsSync(portal)) {
  console.error('[postbuild] capsule-portal.html not found — leaving React app at root');
  process.exit(0);
}

// Preserve the React SPA entry, then make the portal the root document.
copyFileSync(indexHtml, appHtml);
copyFileSync(portal, indexHtml);
console.log('[postbuild] root "/" → Capsule/7 portal · React SPA kept at "/app.html"');
