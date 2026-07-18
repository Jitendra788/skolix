# Deploy frontend (Angular) to Vercel

## 1. Prerequisites

- Vercel account: https://vercel.com
- Backend API must be hosted somewhere public (Render / Railway / VPS).  
  Vercel only serves the Angular UI — FastAPI + SQLite cannot run as this app’s main API on Vercel.

## 2. Deploy from this folder (`frontend/`)

```bash
cd frontend
npx vercel login
npx vercel
```

Production:

```bash
npx vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard:

- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist/frontend/browser`
- **Install Command:** `npm ci`

## 3. Environment variable (required)

In Vercel → Project → Settings → Environment Variables:

| Name         | Value                                      |
|--------------|--------------------------------------------|
| `API_ORIGIN` | Your FastAPI base URL, e.g. `https://skolix-api.onrender.com` |

No trailing slash. `prebuild` injects this into the production build.

## 4. Backend CORS

On the API host, either rely on `allow_origin_regex` for `*.vercel.app`, or set:

```text
CORS_ORIGINS=https://your-app.vercel.app
```

## 5. Local check

```bash
cd frontend
set API_ORIGIN=https://your-api.example.com
npm run build
```

Output: `dist/frontend/browser`
