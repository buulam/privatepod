# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PrivatePod is a self-hosted podcast hosting server. Users upload MP3 files via a web UI or programmatic API, and the app generates a podcast-compatible RSS feed (`/feed.xml`) that works with Apple Podcasts, Spotify, etc.

## Commands

```bash
npm start          # Run server (production)
npm run dev        # Run with nodemon (auto-restart on changes)
npm test           # Run Jest integration tests
docker-compose up -d   # Run in Docker
```

## Architecture

This is a single-file Express 5 app (`index.js`) with a vanilla HTML/JS frontend (`public/index.html`).

**Server (`index.js`):**
- All routes, middleware, and RSS generation in one file
- State is an in-memory `podcastConfig` object loaded from `config/podcast.json` on startup
- Mutations (upload, delete, settings update) write back to `config/podcast.json` synchronously via `fs.writeFileSync`
- File uploads handled by multer, stored in `uploads/` with timestamp-based filenames
- RSS feed generated on each request via the `xml` package in `generateRssFeed()`
- `createEpisode()` helper shared between web UI and programmatic routes
- App is exported via `module.exports` for testing; `app.listen` is guarded behind `require.main === module`

**Frontend (`public/index.html`):**
- Single-page app with tab-based navigation (Episodes / Upload / Settings)
- All JS inline in a `<script>` tag, no build step
- Communicates with backend via fetch to `/api/*` endpoints

**API routes:**
- `GET /feed.xml` — RSS feed (dynamically generated, includes per-episode `<itunes:image>` when present)
- `GET /api/episodes` — list episodes
- `POST /api/episodes` — upload episode via web UI (multipart, title required)
- `POST /api/v1/episodes` — programmatic episode creation (requires `X-API-Key` header, title auto-generated from filename if omitted, supports optional cover image upload)
- `DELETE /api/episodes/:id` — delete episode, audio file, and cover image
- `GET /api/settings` — read podcast settings (no episodes array)
- `PUT /api/settings` — update podcast metadata

**Authentication:**
- `requireApiKey` middleware protects only `/api/v1/*` routes
- API key set via `PRIVATEPOD_API_KEY` env var, compared with timing-safe equality
- Returns 503 if env var not configured, 401 if header missing, 403 if key wrong

**API Documentation:**
- `openapi.yaml` — OpenAPI 3.0 spec for all endpoints
- `README.md` — API Reference section with curl examples

**Persistence:**
- `config/podcast.json` — podcast metadata + episodes array (gitignored)
- `uploads/` — MP3 and image files (gitignored)
- Both directories use `.gitkeep` to preserve structure in git

**Testing:**
- Jest + supertest integration tests in `test/api.test.js`
- Fixture files in `test/fixtures/` (minimal valid MP3 and JPEG)
- Tests use `jest.resetModules()` in `beforeEach` to get a fresh app instance per test

**Docker:**
- `Dockerfile` uses `npm ci --omit=dev` — only production dependencies in the image
- `.dockerignore` excludes `test/`, git files, and Docker files from the build context
- When making changes, always check if `Dockerfile` or `.dockerignore` need updating (e.g., new dependencies, new directories, new env vars in `docker-compose.yml`, new file types that should be excluded from the image)

## Key Design Notes

- Episode IDs are `Date.now()` timestamps as strings
- Audio duration is hardcoded to `'00:00:00'` (not calculated from MP3)
- File size limits: 500MB for audio, 5MB for images (enforced in multer fileFilter by field name)
- Express 5.x is used (not 4.x)
