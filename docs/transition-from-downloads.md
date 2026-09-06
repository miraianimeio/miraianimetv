# Project Structure Transition: From `downloads/hikari` to Production Architecture

This document provides a comprehensive post-mortem and architectural record of the transition of **Mirai Anime** from its original state in `downloads/hikari` to its current production-ready repository structure in `hikari` (v2.0.0).

---

## 1. Executive Summary

The original project at `downloads/hikari` was an unorganized, flat-directory prototype where static HTML files, client-side scripts, CSS styles, server logic, and massive binary assets were placed together in a single folder without separation of concerns.

An in-depth security and architectural audit identified four critical security vulnerabilities, severe performance bottlenecks, lack of support for CORS-restricted APIs (such as MyAnimeList v2), and heavy file duplication.

The repository was systematically restructured into a clean two-tier architecture:
- **Server Tier (`server/`):** Express backend handling data orchestration, TTL caching, streaming host health checks, and secure multi-provider API aggregation (AniList, MyAnimeList, Jikan, MangaDex).
- **Client Tier (`public/`):** Strict static web root featuring modular Vanilla JavaScript (ES Modules), componentized CSS, and secure client-side WebCrypto credential hashing.

---

## 2. Directory Structure Comparison

### Original State (`downloads/hikari`)
All 46 files sat flat in the project root:
```
downloads/hikari/
├── .env (if present, publicly exposed!)
├── package.json (minimal scripts: "node server.js")
├── package-lock.json
├── server.js (served express.static("."))
│
├── [HTML Files in Root]
│   ├── index.html, home.html, watch.html, anime-details.html
│   ├── all-anime-index.html, dmca.html, history.html
│   ├── my-list.html, register.html, updates.html
│
├── [CSS Files in Root]
│   ├── New.css, airing-schedule.css, auth.css, history.css
│   ├── my-list.css, site-bottom-button.css, style.css, stylesheet.css
│   ├── tiktokstyle.css, top-anime.css, updates.css
│
├── [Monolithic & Scattered JS in Root]
│   ├── script.js (65 KB, ~1,500 lines; monolithic, loaded on all pages)
│   ├── api.js (24 KB; duplicated server definitions and AniList GraphQL queries)
│   ├── comments.js, fanart.js, history.js, my-list.js
│   ├── service-worker.js (stale asset cache list)
│   ├── site-bottom-button.js, tiktokscript.js
│
└── [Unchecked Media Assets in Root] (~34 MB total)
    ├── Saberfanart.png (17.4 MB)
    ├── goodbyeMirai.mp4 (8.7 MB)
    ├── Iroha.png (5.1 MB)
    ├── miraivideo.mp4 (3.2 MB)
    ├── irohamirai.mp4, Irohaa.jpg, logo.png, mirai-logo.png, favicons...
```

---

### Modern Refactored State (`hikari` v2.0.0)
Layered architecture with clear boundaries and no leaked server files:
```
hikari/
├── .env.example                # Documented configuration template
├── .gitignore                  # Ignores node_modules, .env, OS files
├── package.json                # Defines "type": "module", scripts: start, dev, check
├── package-lock.json
│
├── docs/                       # Comprehensive project documentation
│   ├── README.md               # Documentation entrypoint & index
│   ├── transition-from-downloads.md # This transition document
│   ├── architecture.md         # System architecture & data flow
│   ├── api-reference.md        # Complete backend REST API docs
│   ├── frontend-architecture.md# Frontend modular system & security
│   └── setup-and-deployment.md # Setup & deployment guide
│
├── server/                     # Backend application (isolated from static server)
│   ├── index.js                # Express app entrypoint, security middleware, error handler
│   ├── config.js               # Zero-dependency .env parser, timeouts, TTL configs
│   ├── lib/
│   │   ├── cache.js            # In-memory TTL cache with background cleanup
│   │   ├── http.js             # Resilient HTTP client with timeouts & UpstreamError
│   │   └── normalize.js        # Unifies AniList, MAL & Jikan models into standard schemas
│   ├── providers/
│   │   ├── anilist.js          # AniList GraphQL queries (catalog spine & primary key)
│   │   ├── mal.js              # Official MyAnimeList v2 REST API client
│   │   └── jikan.js            # Jikan v4 REST API client (voice actor fallback)
│   └── routes/
│       ├── catalog.js          # Unified endpoints (/home, /browse, /search, /anime/:id, etc.)
│       ├── stream.js           # Server health checking & /server-check-all
│       └── manga.js            # Hardened MangaDex proxy with parameter whitelisting
│
└── public/                     # Isolated public web root (only directory served by Express)
    ├── index.html, home.html, watch.html, anime-details.html...
    ├── service-worker.js       # Modern service worker (v12) with accurate static assets
    ├── assets/                 # Curated and optimized images and icons
    ├── css/                    # Modular stylesheets (extracted inline styles)
    │   ├── modal.css           # (Extracted from JS template strings)
    │   ├── tutorial.css        # (Extracted from JS template strings)
    │   └── ...
    └── js/                     # Modern ES Modules
        ├── core/               # Shared foundational infrastructure
        │   ├── api-client.js   # Single network client with stale-while-revalidate
        │   ├── auth.js         # WebCrypto PBKDF2 password hashing & user store
        │   ├── escape.js       # XSS-proof tagged template literal (`html`), raw(), safeUrl()
        │   ├── servers.js      # Single source of truth for streaming providers
        │   └── storage.js      # Safe localStorage / sessionStorage wrappers
        ├── features/           # Reusable feature-level modules
        │   ├── airing.js, browse.js, card.js, carousel.js, comments.js,
        │   ├── details.js, fanart.js, history.js, home.js, modal.js,
        │   ├── my-list.js, nav.js, profile.js, search.js, tiktok.js,
        │   ├── top-anime.js, tutorial.js, watch.js
        └── pages/              # Lightweight page entrypoint scripts
            ├── home.js, watch.js, browse.js, details.js, history.js,
            ├── my-list.js, login.js, register.js, static-page.js, common.js
```

---

## 3. Critical Security Vulnerabilities & Remediation

During the audit of `downloads/hikari`, four critical security flaws were uncovered:

### 1. Static Root Exposure (Directory Traversal / File Disclosure)
- **Vulnerability in `downloads/hikari`:**
  ```javascript
  // Old server.js
  app.use(express.static("."));
  ```
  This served the entire operating directory. Visitors could request `/package.json`, `/server.js`, `/package-lock.json`, and if a `.env` file was created, anyone on the internet could download plaintext secrets, API keys, and environment configs via `GET /.env`.
- **Resolution in `hikari` v2.0.0:**
  The server explicitly serves only the `public/` directory, denies access to dotfiles, sets strict headers (`nosniff`, `SAMEORIGIN`, `no-referrer`), and removes `X-Powered-By`:
  ```javascript
  // server/index.js
  app.disable("x-powered-by");
  app.use(express.static(config.publicDir, {
    dotfiles: "deny",
    index: "index.html",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    }
  }));
  ```

---

### 2. Stored Cross-Site Scripting (XSS) in Comments
- **Vulnerability in `downloads/hikari`:**
  In `comments.js`, user-submitted comment text, usernames, and avatar URLs were concatenated directly into HTML template strings and injected via `.innerHTML`:
  ```javascript
  // Old comments.js
  commentDiv.innerHTML = `
    <div class="user-info">
      <img src="${comment.avatar}" />
      <span>${comment.username}</span>
    </div>
    <p>${comment.text}</p>`; // <--- Executed arbitrary <script> or <img onerror=...>
  ```
  Any user posting a comment with markup or JavaScript payload would have it permanently stored in browser `localStorage` and executed in the context of every future visitor.
- **Resolution in `hikari` v2.0.0:**
  Escaping is enforced **by construction** via [escape.js](../public/js/core/escape.js). An `html` tagged template automatically HTML-escapes all dynamic interpolations by default. Untrusted URLs are validated with `safeUrl()`:
  ```javascript
  import { html, safeUrl } from "../core/escape.js";

  commentDiv.innerHTML = html`
    <div class="user-info">
      <img src="${safeUrl(comment.avatar)}" />
      <span>${comment.username}</span>
    </div>
    <p>${comment.text}</p>`;
  ```
  Verified against multiple standard XSS payloads; zero injected nodes occur.

---

### 3. Reflected Cross-Site Scripting (XSS) in Search / Browse
- **Vulnerability in `downloads/hikari`:**
  On the browse/search page, URL query parameters (`?search=...`) were read and interpolated directly into `innerHTML` to display the "Search results for: ..." header. A crafted hyperlink sent to a user would immediately execute JavaScript in their session.
- **Resolution in `hikari` v2.0.0:**
  All page header text and query reflections are passed through the `html` tagged template, rendering malicious input as harmless plain text entities (`&lt;script&gt;`).

---

### 4. Plaintext Password Storage in `localStorage`
- **Vulnerability in `downloads/hikari`:**
  Registration stored passwords directly as plaintext strings inside `localStorage`:
  ```javascript
  // Old script.js
  const newUser = { firstName, lastName, email, password };
  localStorage.setItem("users", JSON.stringify(users));
  // Login:
  if (user.password !== enteredPassword) { ... }
  ```
  Any script with access to `localStorage` (or through DevTools or an XSS exploit) could dump every user's password. Because users frequently reuse passwords, this posed a severe credential compromise risk.
- **Resolution in `hikari` v2.0.0:**
  Implemented cryptographic password hashing via the WebCrypto API in [auth.js](../public/js/core/auth.js):
  - **Algorithm:** PBKDF2-SHA256
  - **Work Factor:** 210,000 iterations
  - **Salt:** 16 cryptographically secure random bytes per user (`crypto.getRandomValues`)
  - **Storage:** Only `{ salt, hash, iterations }` is written to storage; plaintext is never retained.
  - **Legacy Account Upgrade:** When existing users from the old system log in, their plaintext password is confirmed once, immediately hashed and upgraded in place, and the plaintext `password` property is permanently deleted from storage.

---

## 4. Architectural Enhancements

### A. MyAnimeList (MAL) API Integration & Server Aggregation
- **Problem:**
  MyAnimeList v2 API sends no CORS headers and strictly requires the `X-MAL-CLIENT-ID` header. Browsers cannot call MAL v2 directly without encountering CORS errors or exposing private credentials.
- **Solution:**
  Created an aggregation layer in [catalog.js](../server/routes/catalog.js) and [mal.js](../server/providers/mal.js):
  1. **Primary Key Spine:** AniList IDs remain the primary key because existing streaming embeds, watch history, bookmarks, and airing schedules are keyed by AniList IDs.
  2. **Exact Linkage:** AniList exposes the `idMal` field for media. The server joins records using exact numeric MAL IDs (no fragile title string matching).
  3. **Fault-Tolerant Enrichment:** The join uses `Promise.allSettled()`. If MAL is unconfigured or experiencing downtime, the server returns the AniList core data without failing the request (degraded graceful fallback).
  4. **Jikan v4 Fallback:** MAL v2 has no character or voice actor endpoints; [jikan.js](../server/providers/jikan.js) fills character and voice actor data when needed, rate-limited to <= 3 req/s.

---

### B. Monolithic `script.js` Decomposition
- **Old State:**
  A single `script.js` file (65 KB, ~1,500 lines) contained all UI logic, carousel rendering, comment processing, account handling, modal controllers, and page-specific handlers. It was loaded unconditionally on every page, including static pages.
- **New State:**
  Divided into clear, maintainable ES modules:
  - `core/`: Fundamental utilities (`api-client.js`, `auth.js`, `escape.js`, `servers.js`, `storage.js`).
  - `features/`: Discrete interactive components (`comments.js`, `carousel.js`, `modal.js`, `search.js`, etc.).
  - `pages/`: Specific page controllers importing only what they need (`home.js`, `watch.js`, `browse.js`, etc.).

---

### C. Streaming Server Unification & Probe Optimization
- **Old State:**
  Streaming host configs were hardcoded in four separate locations with duplicated `if/else` checks across `api.js` and `server.js`. Furthermore, every episode change triggered 6 separate cross-origin fetch calls from the browser to probe availability.
- **New State:**
  - Single source of truth in [servers.js](../public/js/core/servers.js) shared between frontend and backend.
  - New server endpoint `/api/server-check-all` checks all 8 streaming servers in parallel on the server side and caches the result for 5 minutes, replacing one client probe per server with a single request.

---

### D. Hardened MangaDex Proxy
- **Old State:**
  The endpoint `/api/manga` in `server.js` directly forwarded raw query strings to `https://api.mangadex.org/manga?${queryString}`, creating an open proxy relay.
- **New State:**
  In [manga.js](../server/routes/manga.js), incoming query parameters are validated against an allowed whitelist (`limit`, `offset`, `title`, `includes[]`, etc.), bounds-checked, and cached.

---

### E. Media Asset Pruning
- **Old State:**
  Huge video and high-resolution raw graphic files (over 34 MB) were kept directly in the project directory without git tracking exclusions.
- **New State:**
  Heavy assets were evaluated and pruned. Key web assets (logos, avatars, icons) were moved to `public/assets/`, bringing total project static media weight down to ~800 KB, with large transient media excluded via `.gitignore`.

---

## 5. File Migration Mapping Reference

| Old Path (`downloads/hikari`) | New Path (`hikari` v2.0.0) | Notes |
| :--- | :--- | :--- |
| `server.js` | `server/index.js`, `server/config.js`, `server/routes/*` | Refactored into modular Express routes and services. |
| `api.js` | `public/js/core/api-client.js`, `public/js/core/servers.js`, `public/js/features/watch.js` | Separated network calls from player logic and server host tables. |
| `script.js` | `public/js/core/*`, `public/js/features/*`, `public/js/pages/*` | Monolith decomposed into ES modules. |
| `comments.js` | `public/js/features/comments.js` | Added XSS protection with `html` tagged template. |
| `history.js` | `public/js/features/history.js`, `public/js/pages/history.js` | Separated state logic from page lifecycle. |
| `my-list.js` | `public/js/features/my-list.js`, `public/js/pages/my-list.js` | Modularized. |
| `fanart.js` | `public/js/features/fanart.js` | Extracted and cleaned up. |
| `site-bottom-button.js` | `public/js/features/nav.js` | Consolidated navigation helpers. |
| `tiktokscript.js` | `public/js/features/tiktok.js` | Modularized TikTok-style feed component. |
| `service-worker.js` | `public/service-worker.js` | Bumped to v12, cleaned dead cache URLs. |
| `*.html` | `public/*.html` | Relocated to public root; `<script type="module">` adopted. |
| `*.css` | `public/css/*.css` | Relocated to `public/css/`; extracted inline styles into `modal.css` and `tutorial.css`. |
| `*.png`, `*.jpg`, `*.mp4` | `public/assets/` | Filtered and curated to optimize download weight. |
