# Mirai Anime System Architecture

This document outlines the technical architecture of **Mirai Anime** (`hikari` v2.0.0), detailing data flow, subsystem responsibilities, multi-provider data aggregation, caching strategies, and streaming integrations.

---

## 1. High-Level Architecture Overview

Mirai Anime uses a decoupled two-tier architecture where the backend functions as an orchestration, security, and caching proxy between external APIs/streaming providers and the browser.

```mermaid
flowchart TD
    subgraph Browser ["Client Tier (public/)"]
        HTML[HTML Pages]
        Pages[Page Scripts<br/>(public/js/pages)]
        Features[Feature Modules<br/>(public/js/features)]
        Core[Core Infrastructure<br/>(api-client, auth, escape, servers)]
        LocalDB[(localStorage / sessionStorage)]
        
        HTML --> Pages
        Pages --> Features
        Features --> Core
        Core <--> LocalDB
    end

    subgraph Server ["Server Tier (server/)"]
        Express[Express Engine<br/>server/index.js]
        RoutesCatalog[routes/catalog.js]
        RoutesStream[routes/stream.js]
        RoutesManga[routes/manga.js]
        Norm[lib/normalize.js]
        Cache[(Memory Cache<br/>lib/cache.js)]
        HTTP[lib/http.js]

        Express --> RoutesCatalog
        Express --> RoutesStream
        Express --> RoutesManga

        RoutesCatalog --> Cache
        RoutesCatalog --> Norm
        RoutesCatalog --> HTTP
        RoutesStream --> HTTP
        RoutesManga --> HTTP
    end

    subgraph Upstream ["External Upstream Providers"]
        AniList[AniList GraphQL API<br/>Catalog Spine & Primary Key]
        MAL[MyAnimeList API v2<br/>Scores, Studios, Ranks]
        Jikan[Jikan API v4<br/>Voice Actors & Characters Fallback]
        MangaDex[MangaDex API<br/>Manga Metadata]
        StreamHosts[Stream Embed Hosts<br/>MegaPlay / VidNest]
    end

    Core -- JSON via /api --> Express
    HTTP --> AniList
    HTTP --> MAL
    HTTP --> Jikan
    HTTP --> MangaDex
    RoutesStream --> StreamHosts
```

---

## 2. Server Architecture

### A. Express Engine ([server/index.js](../server/index.js))
- **Strict Static Isolation:** Serves assets strictly from `public/`.
- **Dotfile Protection:** Rejects any request attempting to access hidden dotfiles (`dotfiles: "deny"`).
- **Security Headers:**
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: SAMEORIGIN`
- **Cache Invalidation for Deploys:** Forces `Cache-Control: no-cache` on `.html` files so clients receive code changes immediately without waiting for service worker cache sweeps.
- **Central Error Handling:** Translates upstream failures into standardized responses reporting the responsible provider without leaking internal server traces.

---

### B. Configuration System ([server/config.js](../server/config.js))
Mirai features a self-contained `.env` loader avoiding external third-party dependencies for environment parsing:
- Prioritizes actual environment variables (`process.env`) over file values.
- Reads `PORT` (default: 3000).
- Reads `MAL_CLIENT_ID` (optional; if absent, gracefully disables MAL enrichment).
- Configures cache TTLs and rate-limiting constants:
  - Details TTL: 12 hours
  - List / Browse TTL: 15 minutes
  - Jikan minimum call interval: 400ms (to honor <= 3 req/s limit)
  - Upstream request timeout: 10 seconds

---

### C. In-Memory TTL Cache ([server/lib/cache.js](../server/lib/cache.js))
- Provides `remember(key, ttlMs, producer)` pattern:
  - Checks if an active entry exists.
  - If present, returns cached value immediately.
  - If missing or expired, executes the producer function, caches the result, and returns it.
- **Background Sweep:** Automatically runs periodic garbage collection every 5 minutes to purge expired cache items and prevent memory leaks.

---

### D. Upstream HTTP Client ([server/lib/http.js](../server/lib/http.js))
- Handles fetch requests with native `AbortSignal.timeout()`.
- Provides automatic error parsing into typed `UpstreamError` objects identifying which provider failed and status code.

---

## 3. Multi-Provider Data Layer

Mirai combines data from three anime metadata services into a single clean catalog model:

| Provider | Protocol | Role & Capabilities |
| :--- | :--- | :--- |
| **AniList** | GraphQL | **Primary Spine:** Supplies all anime IDs, cover art, descriptions, airing countdown timestamps, relations, formats, and genres. |
| **MyAnimeList (MAL)** | REST v2 | **Enrichment:** Mean score, rank, popularity, broadcast times, studios, and alternative licensing titles. |
| **Jikan** | REST v4 | **Character Fallback:** Provides character names, roles, and voice actors when AniList lacks coverage or MAL needs augmentation. |

### Data Join Mechanism
When fetching anime details (`/api/catalog/anime/:id`):
1. The server queries AniList using the requested ID.
2. The returned AniList media object includes the `idMal` reference.
3. If `idMal` is present, the server executes parallel requests via `Promise.allSettled()`:
   - Request MAL details via MAL v2 API.
   - Request character data from Jikan if AniList had empty character edges.
4. If MAL responds, [normalize.js](../server/lib/normalize.js) merges scores, studios, and rankings into the unified payload.
5. If MAL fails or is unconfigured, the request **still succeeds** with AniList data intact.

---

## 4. Streaming Host Architecture

The platform supports multiple video sources across Subbed and Dubbed audio options.

### Unified Server Registry ([public/js/core/servers.js](../public/js/core/servers.js))
Both frontend and backend import this single source of truth:
```javascript
export const SERVERS = [
  // MAL-keyed — addressed by AniList's `idMal`, not the AniList id.
  { code: 7, host: "https://zokoanime.video/stream/mal", idType: "mal", lang: "sub",
    label: "Zoko (Sub)", embedParams: "autostart=false", probe: { requires: 'window.__P=' } },
  { code: 8, host: "https://zokoanime.video/stream/mal", idType: "mal", lang: "dub",
    label: "Zoko (Dub)", embedParams: "autostart=false", probe: { requires: 'window.__P=' } },

  // AniList-keyed
  { code: 1, host: "https://megaplay.buzz/stream/ani", idType: "anilist", lang: "sub", label: "MegaPlay (Sub)", embedParams: "autostart=false" },
  // ... codes 2-6 follow the same shape
];
```

**Identifier types.** Hosts are not keyed by the same id: megaplay and vidnest take
the AniList id, zokoanime takes the MyAnimeList id. Each entry declares `idType`,
and `buildEmbedUrl(code, { anilistId, malId }, episode)` selects the matching one.
This is what AniList's `idMal` is for — the catalog returns both ids on every
record, so a MAL-keyed host needs no extra lookup and no title matching.

AniList remains the app's primary key (watch history, my-list, comments and
resume position are all stored against it). A title with no `idMal` simply cannot
address the MAL-keyed hosts; those report `null` (unknown) rather than `false`,
and their buttons are hidden rather than offered as dead options.

### Health Probing Logic
Because third-party embed servers frequently return HTTP `200 OK` containing HTML error templates rather than proper 404 status codes, the backend probes each host by inspecting the first 50KB of HTML:
Two detection styles are needed, because the hosts fail differently:
- **Title sniffing** (megaplay, vidnest): error patterns in `<title>` (`/^Error\b/i`,
  `/VidNest.*Streaming Embeds/i`) plus body strings (`Failed to fetch`, `404`).
- **Required marker** (zokoanime): this host always returns `<title>Player</title>`
  and swaps the body for a 404 card, so a title tells you nothing. Its entry
  declares `probe: { requires: 'window.__P=' }` — the payload only a real player
  page carries. The rule lives in the server table beside the host it describes,
  rather than as a growing if/else in the probe.
- Provides `/api/server-check-all`, testing all 8 servers concurrently and caching results for 5 minutes. Hosts declare which id they are keyed by (`idType`), so AniList-keyed and MAL-keyed hosts are probed from the same table.

---

## 5. Caching Strategy Matrix

| Cache Layer | Location | Target Data | TTL | Eviction / Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Anime Details** | Server Memory | `/api/catalog/anime/:id` | 12 hours | Expired by sweep or restarted server |
| **Browse / Lists** | Server Memory | `/home`, `/browse`, `/airing` | 15 minutes | Keyed by sorted query parameters |
| **Stream Probe** | Server Memory | `/api/server-check-all` | 5 minutes | Keyed by `probe-all:${anilistId}:${malId}:${episode}` |
| **MangaDex** | Server Memory | `/api/manga` | 15 minutes | Keyed by sanitized query string |
| **Session Cache** | Browser `sessionStorage` | Recent catalog responses | 5 minutes | Stale-while-revalidate (immediate render) |
| **Watch History** | Browser `localStorage` | Up to 60 recently viewed episodes | Persistent | FIFO queue (newest on top) |
| **My List** | Browser `localStorage` | Saved bookmarked anime | Persistent | User-managed list |
| **Static Assets** | Service Worker / HTTP | Images, CSS, JS modules | Cache-First | Revalidated on version bump (v12) |
