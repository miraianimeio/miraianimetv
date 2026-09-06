# Mirai Anime Frontend Architecture

The frontend of Mirai Anime is built using modern, native **ECMAScript (ES) Modules** running directly in the browser without requiring compilation, bundling steps (Webpack, Vite), or transpilers.

---

## 1. Directory Organization

The frontend codebase is located under `public/` and structured into three distinct functional tiers:

```
public/
├── index.html, home.html, watch.html, anime-details.html...
├── css/                     # CSS stylesheets
└── js/
    ├── core/                # System primitives & cross-cutting concerns
    │   ├── api-client.js    # Centralized HTTP request client with caching
    │   ├── auth.js          # WebCrypto authentication & user storage
    │   ├── escape.js        # Safe HTML templating engine (XSS mitigation)
    │   ├── servers.js       # Streaming servers table & URL generators
    │   └── storage.js       # Resilient localStorage / sessionStorage wrappers
    │
    ├── features/            # Interactive UI components and functional widgets
    │   ├── airing.js        # Airing schedule countdown widgets
    │   ├── browse.js        # Catalog search & filter controllers
    │   ├── card.js          # Reusable anime card renderer
    │   ├── carousel.js      # Spotlight banner slideshow
    │   ├── comments.js      # Secure user discussion threads
    │   ├── details.js       # Metadata viewer & relations renderer
    │   ├── fanart.js        # Community artwork submissions
    │   ├── history.js       # Watch history list manager
    │   ├── home.js          # Homepage widget orchestrator
    │   ├── modal.js         # Dialog controller
    │   ├── my-list.js       # User bookmark collection manager
    │   ├── nav.js           # Header navigation & search dropdown
    │   ├── profile.js       # User profile modal & settings
    │   ├── search.js        # Live search suggestions overlay
    │   ├── tiktok.js        # Vertical video feed widget
    │   ├── top-anime.js     # Top anime rankings list
    │   ├── tutorial.js      # Onboarding walkthrough
    │   └── watch.js         # Video player, server picker & episode buttons
    │
    └── pages/               # Per-page entrypoint scripts
        ├── browse.js, common.js, details.js, history.js,
        ├── home.js, login.js, my-list.js, register.js,
        ├── static-page.js, watch.js
```

---

## 2. Core Subsystems

### A. The Safe HTML Templating Engine ([public/js/core/escape.js](../public/js/core/escape.js))
In older versions of the app, developers manually called string escape functions, leading to omitted escaping and severe XSS vulnerabilities.

Mirai v2 adopts an **escaping-by-construction** tagged template literal:
```javascript
import { html, raw, safeUrl } from "../core/escape.js";

// Any dynamic variable interpolated into html`...` is automatically escaped:
const content = html`
  <div class="user-card">
    <img src="${safeUrl(user.avatar)}" />
    <h3>${user.displayName}</h3>
    <p>${user.commentText}</p>
    ${raw(preRenderedTrustedButtons)}
  </div>
`;
```
- **Automatic Escaping:** Characters `&`, `<`, `>`, `"`, and `'` are converted into HTML entities.
- **Explicit Exemption (`raw()`):** Only strings wrapped in `raw(...)` bypass escaping.
- **URL Sanitization (`safeUrl()`):** Prevents `javascript:` payloads in `href` and `src` attributes by verifying URL protocols.

---

### B. Client-Side Authentication & WebCrypto ([public/js/core/auth.js](../public/js/core/auth.js))
Mirai provides a client-side account and profile system that protects user credentials using standard Web Cryptography primitives:
- **Algorithm:** PBKDF2 with SHA-256 digest.
- **Iterations:** 210,000 rounds.
- **Salt:** 16-byte random salt generated with `crypto.getRandomValues()`.
- **Zero Plaintext:** Plaintext passwords are never saved to storage.
- **Constant-Time Verification:** Compares hashes using XOR accumulation to avoid timing leaks:
  ```javascript
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ credential.hash.charCodeAt(i);
  }
  return mismatch === 0;
  ```
- **Transparent Legacy Account Migration:** When an old account created in the prototype era logs in, the system validates the password, computes a new PBKDF2 hash with unique salt, updates the record, and deletes the legacy plaintext password field.

> [!NOTE]
> This authentication system is designed for browser-side personalization (favorites, history, profile custom avatar). For multi-user server-authoritative databases, a session token architecture should be layered on the backend.

---

### C. Safe Storage Abstractions ([public/js/core/storage.js](../public/js/core/storage.js))
Web storage APIs (`localStorage` and `sessionStorage`) can throw uncaught exceptions in private browsing mode or when disk quota is reached.
`storage.js` wraps all storage access with safe read/write utilities:
- `readJson(key, defaultValue)`
- `writeJson(key, value)`
- `session.get(key)` / `session.set(key, value)`

---

### D. Single Network Client ([public/js/core/api-client.js](../public/js/core/api-client.js))
All network communications pass through `api-client.js`.
- Eliminates hardcoded `fetch()` queries across feature files.
- Implements a **stale-while-revalidate** caching pattern with `sessionStorage`:
  1. If cached data exists, invokes the render callback immediately (instant UI paint).
  2. Asynchronously requests fresh data from the server.
  3. If fresh data differs from the cached payload, re-runs the render callback with the new data.

---

## 3. Page Lifecycle Model

Pages in `public/*.html` load an ES module script tag:
```html
<script type="module" src="js/pages/home.js"></script>
```

A page script acts as a lean coordinator:
```javascript
// public/js/pages/home.js
import { initCommon } from "./common.js";
import { initHeroCarousel } from "../features/carousel.js";
import { initHomeSections } from "../features/home.js";
import { initAiringSchedule } from "../features/airing.js";
import { initTopAnime } from "../features/top-anime.js";

document.addEventListener("DOMContentLoaded", () => {
  initCommon();
  initHeroCarousel();
  initHomeSections();
  initAiringSchedule();
  initTopAnime();
});
```

Benefits:
1. **Zero Global Namespace Pollution:** All variables and imports are module-scoped.
2. **On-Demand Loading:** Static pages (such as `dmca.html`) do not load unnecessary carousels or player code.
3. **Easy Testability:** Feature modules export testable pure functions.

---

## 4. Service Worker ([public/service-worker.js](../public/service-worker.js))

- **Version:** v12
- **Pre-cached Shell:** Core HTML pages, stylesheets (`css/*.css`), and static assets (`assets/*`).
- **Policy:** Cache-first for local static assets; network-first with revalidation for HTML and API queries. Client-side caching of volatile API responses was intentionally removed in v12 to prevent stale catalog schedules.
