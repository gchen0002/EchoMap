# EchoMap

Drop a voice. Discover a moment.

EchoMap is a location-based social app built during TreeLine Hacks. Users can leave short, ephemeral audio notes at real-world coordinates, and nearby people can discover them on a live map when they move within range.

## What it does

- Drop an echo at your current GPS location
- Discover nearby echoes within a 500 meter radius
- Play back generated audio, or fall back to browser speech for text-only echoes
- Auto-expire echoes after 24 hours
- Sync auth with Clerk and real-time data with Convex
- Visualize everything in a map-first Next.js interface powered by Mapbox

## Why the backend is interesting

Echo discovery is built around geohash spatial indexing instead of checking every row in the database.

1. A user's latitude and longitude are encoded into a geohash.
2. Each echo is stored with that geohash and indexed in Convex.
3. Nearby lookup queries the current cell plus surrounding cells.
4. Results are refined with the Haversine formula to keep the final radius accurate.

That keeps nearby discovery fast while still returning exact distance-filtered results.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4 + Framer Motion
- Convex for database, file storage, realtime queries, actions, and cron jobs
- Clerk for authentication
- Mapbox GL via `react-map-gl`
- Google Cloud Text-to-Speech for generated audio
- OpenNext + Cloudflare for deployment

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `echomap/.env.local` with the values your environment needs:

```env
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_MAPBOX_TOKEN=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=

# Optional for generated MP3 audio. Without this, echoes are saved as text-only
# and played back with the browser speech synthesis fallback.
GOOGLE_APPLICATION_CREDENTIALS_JSON=
```

Notes:

- `CLERK_JWT_ISSUER_DOMAIN` is required by `convex/auth.config.ts`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` should contain the full JSON service account payload on one line
- If `NEXT_PUBLIC_MAPBOX_TOKEN` or `NEXT_PUBLIC_CONVEX_URL` is missing, the UI shows a configuration screen instead of the map

### 3. Run Convex

```bash
npx convex dev
```

### 4. Start the app

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Available scripts

- `npm run dev` - start the Next.js dev server
- `npm run build` - create a production build
- `npm run start` - run the production build locally
- `npm run lint` - run ESLint
- `npm run test:location` - run the location helper smoke test
- `npm run seed` - seed demo users and demo echoes into Convex
- `npm run preview` - build and preview the Cloudflare deployment locally
- `npm run deploy` - build and deploy with OpenNext for Cloudflare
- `npm run upload` - upload the OpenNext build artifacts
- `npm run cf-typegen` - generate Wrangler environment types

## Seeding demo data

You can seed a small demo dataset centered around San Francisco:

```bash
npm run seed
```

This creates demo users plus multiple demo echoes so the map is not empty during demos.

Important:

- The seed flow uses the internal Google TTS path and expects `GOOGLE_APPLICATION_CREDENTIALS_JSON` to be configured
- User-created echoes gracefully fall back to text-only mode when Google TTS is unavailable

## Project structure

```text
echomap/
|- app/
|  |- components/
|  |  |- EchoMap.tsx          # Main map UI and nearby echo experience
|  |  |- DropEchoModal.tsx    # Echo creation flow
|  |  '- echoMapLocation.ts   # Location request helper
|  |- layout.tsx              # App shell and metadata
|  '- page.tsx                # Client entrypoint
|- convex/
|  |- echoes.ts               # Echo queries and mutations
|  |- tts.ts                  # Google TTS action and upload flow
|  |- schema.ts               # Convex data model
|  |- cleanup.ts              # Expired echo cleanup job
|  |- crons.ts                # Scheduled background jobs
|  '- users.ts                # Clerk-to-Convex user sync
|- lib/
|  '- geohash.ts              # Spatial indexing and distance utilities
|- scripts/
|  '- test-echo-map-location.js
|- open-next.config.ts
|- wrangler.jsonc
and package config files
```

## Core product behavior

- Echoes are discoverable only when a user is physically nearby
- Each echo expires 24 hours after creation
- Nearby results are distance-sorted
- Audio is stored in Convex file storage
- Cleanup jobs remove expired echoes and stale TTS quota reservations

## Deployment

The project is set up for Cloudflare via OpenNext.

```bash
npm run preview
npm run deploy
```

Relevant files:

- `open-next.config.ts`
- `wrangler.jsonc`
- `middleware.ts`

## Hackathon context

EchoMap was built to show a map-first social product with a clear algorithms angle: real-world discovery powered by geohash indexing instead of naive full-database distance scans.
