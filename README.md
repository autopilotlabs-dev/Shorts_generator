# Nightshade — Horror Shorts Studio

Turn a written horror story into a narrated, animated **10–60 second vertical video** (MP4, 9:16) for YouTube Shorts, Reels and TikTok.

**Flow:** sign up → write a story → **Generate scenes** → **Generate narration** → optional **AI image** per scene → preview → **Render MP4** → download from your library.

## Tech stack, and why each piece was chosen

| Layer | Choice | Why | Considered |
|---|---|---|---|
| Web framework | **Next.js 16** (App Router) + **Tailwind CSS 4** | Full-stack React: UI and API in one deployable app | — |
| Auth | **Better Auth** (email + password) | Current default for new Next.js apps; users and sessions live in our own Postgres; plugins for OAuth/passkeys later | Auth.js (mainly for existing apps), Clerk (hosted, paid) |
| Database | **PostgreSQL** + **Drizzle ORM** | Production-grade; Drizzle is SQL-first with no codegen step; migrations in `db/migrations` | Prisma |
| Jobs | **BullMQ** on **Redis**, separate **worker** process | Standard for long CPU-heavy jobs with progress and retries; web requests never block on rendering | pg-boss, Inngest (HTTP timeouts on multi-minute jobs) |
| Rate limits | **rate-limiter-flexible** on Redis | Shared across instances, survives restarts | — |
| Storage | `local` disk **or** any **S3-compatible** bucket (R2/S3/MinIO) | Local for personal use; switch to R2/S3 with env vars, no code change | — |
| Video | **Remotion** (`@remotion/player` + `@remotion/renderer`) | One React composition drives both the in-app preview and the final MP4; scales out later with Remotion Lambda | Hand-written canvas + ffmpeg pipeline (replaced) |
| Scene planning | **Claude** (`claude-opus-5-5`, structured output) | Turns a story into a timed scene list with visuals, mood, sound and image prompts; a rule-based planner is the fallback | — |
| Voice | **OpenAI `gpt-4o-mini-tts`** | Budget choice: about $0.015 per minute of audio, delivery steerable by instructions | ElevenLabs (more expressive, much pricier) |
| Images | **OpenAI `gpt-image-1-mini`** | Budget choice: $0.006 (low) / $0.015 (medium) per 1024×1536 image | GPT Image 1.5, FLUX.2, Imagen 4 |

**Remotion licence:** Remotion is free for individuals and companies with up to 3 employees. Above that, a company licence is required ($0.01 per render, $100/month minimum for automated rendering). See [remotion.dev/license](https://www.remotion.dev/docs/license).

### How a video is made

```
Editor (React) ── autosave ──► Postgres (Drizzle)
   │ Generate scenes ─────────► Claude ─ or ─ offline planner
   │ Generate narration ──────► OpenAI TTS ─► MP3 in storage ─► scene timing fitted to voice
   │ AI image ────────────────► OpenAI images ─► JPEG in storage
   │ Preview: <Player> + soundtrack mixed in the browser (OfflineAudioContext)
   └ Render MP4 ─► BullMQ ─► worker:
                     1. mix soundtrack (node-web-audio-api) → WAV
                     2. Remotion renderMedia(HorrorShort) with signed media URLs → MP4 + poster
                     3. upload to storage, update the renders table (the UI polls it)
```

The scene painter (`lib/engine/renderer.ts`, `visuals.ts`) and the sound engine (`lib/engine/audio.ts`) are plain TypeScript. They run unchanged in the browser and in the worker, so the preview and the export match.

## Run it (personal use)

### With Docker (everything included)

```bash
cp .env.example .env          # set BETTER_AUTH_SECRET (openssl rand -base64 32) and your API keys
docker compose up --build     # web on http://localhost:3000, plus worker, Postgres, Redis
```

### Without Docker

Requirements: Node 22, Postgres 16, Redis 7.

```bash
npm install
npx remotion browser ensure   # downloads Chrome Headless Shell for rendering
cp .env.example .env.local    # fill in DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, API keys
npm run db:migrate
npm run dev                   # terminal 1: web app
npm run worker                # terminal 2: render worker
```

API keys are optional:
- **`ANTHROPIC_API_KEY`** enables Claude scene planning.
- **`OPENAI_API_KEY`** enables narration and AI images.

Without keys you still get the offline planner and procedural visuals.

## Going to production later

You only change environment variables:
- **Database:** set `DATABASE_URL` to managed Postgres (e.g. Neon, Supabase).
- **Redis:** set `REDIS_URL` to managed Redis (e.g. Upstash).
- **Storage:** set `STORAGE_DRIVER=s3` plus the `S3_*` variables for Cloudflare R2 or AWS S3.
- **Web app:** deploy to Vercel or any Node host. Run the worker on a VM or container service, or move rendering to **Remotion Lambda**. The composition is already packaged for that; set `REMOTION_SERVE_URL` to a deployed site.

## Render performance (measured)

Measured with Remotion on a 4-core machine, for a 20-second video:

| Quality | Render time | Speed |
|---|---|---|
| 1080×1920 | ≈ 76 s | ≈ 3.8× the video length |
| 720×1280 | ≈ 46 s | ≈ 2.3× the video length |

- **Faster renders:** add CPU cores, lower `REMOTION_CONCURRENCY` if memory-bound, or move to Remotion Lambda.
- **Output:** H.264, CRF 21, AAC audio.

## Scripts

| Command | |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Web app |
| `npm run worker` | Render worker |
| `npm run db:migrate` / `npm run db:generate` | Apply / create Drizzle migrations |
| `npm run auth:generate` | Regenerate Better Auth tables (`db/auth-schema.ts`) |
| `npm run studio` | Open the composition in Remotion Studio |
| `npm test` | Unit tests; with `DATABASE_URL` set, also Postgres access-control tests |
| `npm run typecheck` | TypeScript |

## Project layout

```
app/              pages + API routes (auth via Better Auth, projects, plan, narration, images, renders, media)
components/       bento UI (shell, dashboard, editor)
db/               Drizzle schema (auth + app tables) and migrations
lib/engine/       shared scene painter, captions, sound engine, offline soundtrack mixer, planner
lib/server/       session, storage, queue, rate limits, Claude / OpenAI clients, validation
lib/client/       browser helpers (soundtrack preview, thumbnails, fetch)
remotion/         the Remotion composition (HorrorShort) and root
worker/           BullMQ render worker
public/fonts/     caption + UI fonts (SIL Open Font License)
```
