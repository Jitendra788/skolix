/**
 * Writes API_ORIGIN into environment.prod.ts and public/env.js before build.
 */
const fs = require('fs');
const path = require('path');

const origin = (process.env.API_ORIGIN || '').trim().replace(/\/$/, '');
const root = path.join(__dirname, '..');
const envProd = path.join(root, 'src', 'environments', 'environment.prod.ts');
const envJs = path.join(root, 'public', 'env.js');

if (!origin) {
  console.log(
    '[set-api-origin] API_ORIGIN not set — leaving production placeholders. Set it on Vercel for live login.',
  );
  // Still ensure env.js exists for local/prod fallback messaging
  if (!fs.existsSync(envJs)) {
    fs.writeFileSync(
      envJs,
      `window.__SKOLIX_API_ORIGIN__ = '';\n`,
      'utf8',
    );
  }
  process.exit(0);
}

fs.writeFileSync(
  envProd,
  `export const environment = {
  production: true,
  apiOrigin: ${JSON.stringify(origin)},
};
`,
  'utf8',
);

fs.writeFileSync(
  envJs,
  `window.__SKOLIX_API_ORIGIN__ = ${JSON.stringify(origin)};\n`,
  'utf8',
);

console.log(`[set-api-origin] production apiOrigin = ${origin}`);
