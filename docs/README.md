# Mirai Anime (Hikari) Documentation

Welcome to the documentation for **Mirai Anime** (repository: `hikari`). This project is a modern anime streaming and discovery platform featuring a unified catalog that aggregates data across multiple providers (AniList, MyAnimeList, Jikan), client-safe video streaming embed management with real-time server health probing, secure client-side user accounts, and a modular architecture.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| **[Project Structure Transitioning](transition-from-downloads.md)** | **Key Document:** Detailed breakdown of how the project evolved from its original state in `downloads/hikari` into the current clean architecture, including security audits, structural diffs, and modernization rationale. |
| **[System Architecture](architecture.md)** | Technical overview of the dual-tier client/server architecture, backend routing, multi-provider data aggregation, caching strategy, and streaming integration. |
| **[API Reference](api-reference.md)** | Comprehensive API documentation for all server endpoints under `/api/catalog/*`, `/api/server-check*`, `/api/servers`, and `/api/manga`. |
| **[Frontend Architecture](frontend-architecture.md)** | Overview of frontend ES modules (`core/`, `features/`, `pages/`), the XSS-proof tagged template engine (`html`), PBKDF2 authentication, and UI styling. |
| **[Setup & Deployment](setup-and-deployment.md)** | Installation, configuration (`.env` variables, MAL API setup), local development, and production deployment guidelines. |

---

## ⚡ Quick Architecture Summary

```
                      +-----------------------------+
                      |         Web Browser         |
                      |  (ES Modules, PBKDF2 Auth)  |
                      +--------------+--------------+
                                     |
                             REST / JSON & Static
                                     |
                                     v
                      +-----------------------------+
                      |     Express Node.js Server  |
                      | (Cache, Security, Probing)  |
                      +---+-----------+-----------+-+
                          |           |           |
            +-------------+           |           +-------------+
            v                         v                         v
   +-----------------+       +-----------------+       +-----------------+
   |  AniList (GQL)  |       |   MAL v2 (REST) |       |  Jikan v4 (REST)|
   |   (Primary ID)  |       |  (Score/Studio) |       |   (Characters)  |
   +-----------------+       +-----------------+       +-----------------+
```

- **Frontend:** Vanilla ES modules running natively in modern browsers without complex bundler steps. Structured into `public/js/core/`, `public/js/features/`, and `public/js/pages/`.
- **Backend:** Node.js (>= 18) with Express 4, providing server-side TTL caching, secure external API aggregation (AniList, MyAnimeList, Jikan, MangaDex), and parallel streaming host probing.
- **Security:** Strict separation of public assets (dotfiles denied, server sources unexposed), default-escaping tagged templates against XSS, and WebCrypto PBKDF2-SHA256 password hashing.
