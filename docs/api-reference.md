# Mirai Anime API Reference

The backend exposes a JSON REST API under the `/api` path. All responses return standard JSON with UTF-8 encoding.

---

## 1. Catalog Endpoints (`/api/catalog`)

### `GET /api/catalog/home`
Returns curated lists for the homepage (recommended and trending anime).
- **Cache TTL:** 15 minutes
- **Response `200 OK`:**
  ```json
  {
    "recommended": [
      {
        "id": 16498,
        "title": { "english": "Attack on Titan", "romaji": "Shingeki no Kyojin" },
        "coverImage": { "large": "https://..." },
        "episodes": 25,
        "format": "TV",
        "nextAiringEpisode": null
      }
    ],
    "trending": [ ... ]
  }
  ```

---

### `GET /api/catalog/search`
Provides live autocomplete search suggestions.
- **Query Parameters:**
  - `q` (string, required): Search query (minimum 2 characters).
- **Response `200 OK`:**
  ```json
  {
    "results": [
      {
        "id": 21,
        "title": { "english": "One Piece", "romaji": "ONE PIECE" },
        "coverImage": { "large": "https://..." }
      }
    ]
  }
  ```

---

### `GET /api/catalog/browse`
Filters and paginates the complete anime catalog.
- **Query Parameters:**
  - `page` (number, optional, default: 1, max: 500)
  - `sort` (string, optional, default: `POPULARITY_DESC`)
    - Whitelist: `POPULARITY_DESC`, `SCORE_DESC`, `TRENDING_DESC`, `FAVOURITES_DESC`, `START_DATE_DESC`, `TITLE_ROMAJI`, `UPDATED_AT_DESC`, `EPISODES_DESC`
  - `genre` (string, optional, max 40 chars)
  - `search` (string, optional, max 100 chars)
  - `format` (string, optional)
    - Whitelist: `TV`, `TV_SHORT`, `MOVIE`, `SPECIAL`, `OVA`, `ONA`, `MUSIC`
  - `status` (string, optional)
    - Whitelist: `FINISHED`, `RELEASING`, `NOT_YET_RELEASED`, `CANCELLED`, `HIATUS`
  - `season` (string, optional)
    - Whitelist: `WINTER`, `SPRING`, `SUMMER`, `FALL`
  - `seasonYear` (number, optional, 1940–2100)
- **Response `200 OK`:**
  ```json
  {
    "page": 1,
    "hasNextPage": true,
    "lastPage": 85,
    "results": [ ... ]
  }
  ```

---

### `GET /api/catalog/airing`
Retrieves the upcoming episode schedule sorted chronologically.
- **Cache TTL:** 15 minutes
- **Response `200 OK`:**
  ```json
  {
    "results": [
      {
        "id": 154587,
        "title": { "english": "Frieren: Beyond Journey's End", "romaji": "Sousou no Frieren" },
        "nextAiringEpisode": {
          "episode": 29,
          "airingAt": 1709904600
        }
      }
    ]
  }
  ```

---

### `GET /api/catalog/ranking`
Retrieves top-ranked anime across different time horizons.
- **Query Parameters:**
  - `period` (string, optional): `day`, `week`, or `month` (default: `day`).
  - `source` (string, optional): `anilist` (default) or `mal`.
- **Response `200 OK`:**
  ```json
  {
    "period": "day",
    "source": "anilist",
    "results": [ ... ]
  }
  ```

---

### `GET /api/catalog/mal/ranking`
Passthrough for MyAnimeList's native ranking categories.
- **Query Parameters:**
  - `type` (string, optional, default: `bypopularity`):
    - Whitelist: `all`, `airing`, `upcoming`, `tv`, `ova`, `movie`, `special`, `bypopularity`, `favorite`
  - `limit` (number, optional, default: 20, max: 100)
- **Response `200 OK`:**
  ```json
  {
    "type": "bypopularity",
    "source": "mal",
    "results": [ ... ]
  }
  ```
- **Error `503 Service Unavailable`:** If `MAL_CLIENT_ID` is not configured in `.env`.

---

### `GET /api/catalog/anime/:id`
Returns full enriched metadata for a single anime by joining AniList, MyAnimeList, and Jikan.
- **Path Parameters:**
  - `id` (integer, required): AniList anime ID.
- **Cache TTL:** 12 hours
- **Response `200 OK`:**
  ```json
  {
    "id": 16498,
    "malId": 16498,
    "title": {
      "english": "Attack on Titan",
      "romaji": "Shingeki no Kyojin",
      "native": "進撃の巨人"
    },
    "description": "...",
    "coverImage": { "large": "...", "extraLarge": "..." },
    "bannerImage": "...",
    "format": "TV",
    "status": "FINISHED",
    "episodes": 25,
    "duration": 24,
    "season": "SPRING",
    "seasonYear": 2013,
    "genres": ["Action", "Drama", "Fantasy", "Mystery"],
    "score": {
      "average": 84,
      "decimal": 8.4,
      "malMean": 8.54,
      "malRank": 115,
      "malPopularity": 1
    },
    "studios": ["Wit Studio"],
    "characters": [
      {
        "id": 40882,
        "name": "Eren Yeager",
        "role": "MAIN",
        "image": "...",
        "voiceActors": [
          { "id": 80, "name": "Yuki Kaji", "language": "JAPANESE", "image": "..." }
        ]
      }
    ],
    "relations": [ ... ],
    "recommendations": [ ... ],
    "_sources": ["anilist", "mal"]
  }
  ```
- **Error `404 Not Found`:** If ID does not exist in AniList.

---

### `GET /api/catalog/anime/:id/characters`
Fetches extended character and voice actor listings (AniList primary, Jikan fallback).
- **Path Parameters:**
  - `id` (integer, required): AniList anime ID.
- **Response `200 OK`:**
  ```json
  {
    "source": "anilist",
    "characters": [ ... ]
  }
  ```

---

## 2. Streaming Endpoints (`/api`)

### `GET /api/servers`
Returns the list of active streaming server providers.
- **Response `200 OK`:**
  ```json
  {
    "servers": [
      { "code": 7, "label": "Zoko (Sub)", "lang": "sub", "idType": "mal" },
      { "code": 8, "label": "Zoko (Dub)", "lang": "dub", "idType": "mal" },
      { "code": 1, "label": "MegaPlay (Sub)", "lang": "sub", "idType": "anilist" },
      { "code": 2, "label": "MegaPlay (Dub)", "lang": "dub", "idType": "anilist" },
      { "code": 3, "label": "VidNest Pahe (Sub)", "lang": "sub", "idType": "anilist" },
      { "code": 4, "label": "VidNest Pahe (Dub)", "lang": "dub", "idType": "anilist" },
      { "code": 5, "label": "VidNest (Sub)", "lang": "sub", "idType": "anilist" },
      { "code": 6, "label": "VidNest (Dub)", "lang": "dub", "idType": "anilist" }
    ]
  }
  ```

---

### `GET /api/server-check-all`
Concurrently probes every streaming host for a specific anime episode.
- **Query Parameters:**
  - `animeId` (numeric string, required) — the **AniList** id
  - `episode` (numeric string, required)
  - `malId` (numeric string, optional) — the **MyAnimeList** id, needed to address
    MAL-keyed hosts (Zoko). If omitted the server resolves it from AniList's
    `idMal`, so passing it only saves that lookup.
- **Cache TTL:** 5 minutes
- **Response `200 OK`:**
  ```json
  {
    "animeId": "154587",
    "malId": "52991",
    "episode": "1",
    "availability": {
      "7": true,
      "8": true,
      "1": false,
      "2": false,
      "3": false,
      "4": false,
      "5": false,
      "6": null
    }
  }
  ```
  *(`true` = working, `false` = confirmed missing/error, `null` = unknown — either a
  probe timeout, or a MAL-keyed host for a title that has no `idMal` and therefore
  cannot be addressed at all.)*

---

### `GET /api/server-check`
Single-server probe maintained for legacy backward compatibility.
- **Query Parameters:**
  - `server` (1–8)
  - `animeId` (numeric string) — AniList id
  - `episode` (numeric string)
  - `malId` (numeric string, optional) — as above
- **Response `200 OK`:**
  ```json
  { "available": true }
  ```

---

## 3. Manga Endpoint (`/api/manga`)

### `GET /api/manga`
Safely proxies requests to the MangaDex API with parameter whitelisting and bounded lengths.
- **Whitelisted Parameters:**
  - `limit`, `offset`, `title`, `order[followedCount]`, `order[relevance]`, `order[latestUploadedChapter]`, `contentRating[]`, `includes[]`, `availableTranslatedLanguage[]`, `status[]`, `year`
- **Response `200 OK`:** Standard MangaDex API response JSON.
