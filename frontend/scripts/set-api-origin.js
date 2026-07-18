/**
 * Writes API_ORIGIN from the environment into environment.prod.ts before build.
 * Usage (Vercel): set Project env API_ORIGIN, then `npm run build` runs this via prebuild.
 */
const fs = require('fs');
const path = require('path');

const origin = (process.env.API_ORIGIN || '').trim().replace(/\/$/, '');
const file = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts');

if (!origin) {
  console.log(
    '[set-api-origin] API_ORIGIN not set — leaving environment.prod.ts unchanged. Set it on Vercel for production.',
  );
  process.exit(0);
}

const contents = `export const environment = {
  production: true,
  apiOrigin: ${JSON.stringify(origin)},
};
`;

fs.writeFileSync(file, contents, 'utf8');
console.log(`[set-api-origin] production apiOrigin = ${origin}`);
