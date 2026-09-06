# Setup and Deployment Guide

This guide covers local development setup, environment configuration, and production deployment for **Mirai Anime** (`hikari`).

---

## 1. Prerequisites

- **Node.js:** Version 18.0.0 or later (required for native `fetch`, WebCrypto, and ES Modules).
- **Package Manager:** `npm` (bundled with Node.js).
- **Network Access:** Outbound HTTPS access to:
  - `graphql.anilist.co`
  - `api.myanimelist.net`
  - `api.jikan.moe`
  - `api.mangadex.org`

---

## 2. Installation & Quick Start

```bash
# 1. Enter the project directory
#    (no git remote is configured yet — add one with `git remote add origin <url>`)
cd hikari

# 2. Install dependencies (only Express is required)
npm install

# 3. Create your environment configuration
cp .env.example .env

# 4. Start the development server (auto-reloads on changes using Node 18+ --watch)
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

> [!IMPORTANT]
> Browse to `http://localhost:3000` — do **not** open `public/home.html` from
> disk. The frontend is native ES modules and calls `/api` as a same-origin
> path, neither of which works over `file://`. See
> [Running It](#5-running-it-things-that-actually-trip-people-up) below.

---

## 3. Environment Variables Configuration

Create a `.env` file in the project root. The server includes a built-in loader that reads these variables without requiring external dependencies:

```ini
# Port for the Express server to listen on (default: 3000)
PORT=3000

# MyAnimeList API v2 Client ID (optional, but recommended)
# Obtain from https://myanimelist.net/apiconfig
MAL_CLIENT_ID=your_mal_client_id_here

# Server-side cache duration for single anime details (default: 12 hours)
CACHE_TTL_DETAILS_MS=43200000

# Server-side cache duration for browse/lists/trending (default: 15 minutes)
CACHE_TTL_LIST_MS=900000

# Minimum millisecond delay between Jikan API calls (default: 400ms for <= 3 req/s)
JIKAN_MIN_INTERVAL_MS=400
```

### Obtaining a MyAnimeList Client ID
1. Log in to [MyAnimeList](https://myanimelist.net/).
2. Navigate to **Account Settings** > **API** (or visit [https://myanimelist.net/apiconfig](https://myanimelist.net/apiconfig)).
3. Click **Create ID** and select **Web** or **Other** as the App Type.
4. Copy the generated **Client ID** into `MAL_CLIENT_ID` in your `.env`.

> [!TIP]
> **Running Without MAL:** If `MAL_CLIENT_ID` is left empty, the server automatically degrades gracefully: AniList serves all primary catalog data, Jikan provides character voice actor details, and MAL score enrichment is simply skipped without any runtime errors.

---

## 4. Available NPM Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts server using Node's native file watcher (`node --watch server/index.js`). |
| `npm start` | Runs the server in standard production mode (`node server/index.js`). |
| `npm run check` | Pre-flight validation without launching the server: parses every JS file, resolves every relative import, and confirms every HTML asset reference exists. Exits non-zero on failure, so it can gate a commit or CI run. |

---

## 5. Running It: Things That Actually Trip People Up

### You must go through the server — opening the HTML directly no longer works

Double-clicking `public/home.html`, or any `file://` URL, will load a blank or
broken page. This is expected, and it is a change from the pre-restructure build.

Two reasons:

1. The frontend is **native ES modules**. Browsers enforce CORS on module
   imports, and the `file://` origin is opaque, so every `import` is blocked.
2. The pages call **`/api/...`** as a same-origin path. There is no origin to be
   same as on `file://`. The old build papered over this with a hardcoded
   `http://localhost:3000` fallback; that fallback is gone, because shipping a
   hardcoded localhost URL to production was itself a defect.

Always start the server and browse to `http://localhost:3000`.

### The app runs fine without a MAL client ID

`MAL_CLIENT_ID` is optional. Leave it blank and the server logs:

```
MAL         : disabled (set MAL_CLIENT_ID in .env)
```

AniList still serves the entire catalog. What you lose is only the MAL
enrichment — `scores.mal`, rank, popularity, members, studios. Nothing errors.
Confirm which providers are live at any time:

```bash
curl -s http://localhost:3000/api/catalog/status
```

### A fresh clone is missing one image

`public/assets/Saberfanart.png` (17MB) is deliberately **not** tracked in git —
see the note in `.gitignore`. The fan-art gallery falls back to the logo when it
is absent, so the site runs fine without it. Supply it via Git LFS or object
storage before deploying, or compress it first.

### Jikan may be unreachable from Node on some hosts

Jikan sits behind Cloudflare, which on some networks rejects Node's `fetch`
(undici) while `curl` to the same URL succeeds. Check from your deploy host:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.jikan.moe/v4/anime/21/characters
```

Jikan is only the character/voice-actor **fallback**, used when AniList has no
cast for a title. If it is blocked you lose a cast list, never a page. AniList
and `api.myanimelist.net` are unaffected.

### Port 3000 already in use

Either set `PORT` in `.env`, or free the port:

```bash
lsof -ti:3000 | xargs kill    # macOS / Linux
```

### Verifying a change didn't break anything

There is no build step, so nothing catches a bad import path for you until the
page is blank in a browser. Run this first:

```bash
npm run check
```

---

## 6. Production Deployment

### A. Process Management with PM2
For continuous uptime and automatic restart upon crashes or server reboots:

```bash
# Install PM2 globally
npm install -g pm2

# Launch Mirai Anime
pm2 start server/index.js --name "mirai-anime"

# Save process list for system reboot
pm2 save
pm2 startup
```

---

### B. Reverse Proxy Configuration (Nginx)
In production, place Express behind a reverse proxy like Nginx for SSL termination, HTTP/2 or HTTP/3, and DDoS buffering:

```nginx
server {
    listen 80;
    server_name anime.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name anime.example.com;

    ssl_certificate /etc/letsencrypt/live/anime.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/anime.example.com/privkey.pem;

    # Gzip compression for static files
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### C. Containerization (Dockerfile Example)

> [!IMPORTANT]
> The `COPY . .` below copies everything not listed in `.dockerignore`. That
> file is committed alongside the Dockerfile and excludes `.env` — without it,
> your MAL client ID is baked into an image layer and survives even if a later
> layer deletes it.

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
```
