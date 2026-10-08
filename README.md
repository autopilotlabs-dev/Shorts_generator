# Nightshade — Horror Shorts Studio

A full-stack **Next.js** app that turns a written horror story into a narrated, animated **10–60 second vertical video** (1080×1920 MP4) for YouTube Shorts, Reels and TikTok.

**Pipeline:** sign up → write or paste a story → **Generate scenes** → add a **narrator voice** → optional **AI images** per scene → preview in the browser → **Render MP4** on the server → download from your library.

## Features

| | |
|---|---|
| **Accounts & projects** | Email/password accounts. Stories, scenes, settings, narration, images and rendered videos are saved per user and autosaved while you edit. |
| **AI director** | Claude breaks the story into timed scenes and picks a visual, mood, effects, sound cues and an image prompt for each. A built-in rule-based planner is used when no key is set. |
| **Narration** | Text-to-speech per scene with ElevenLabs or OpenAI, using a hushed horror-narrator delivery. Scene timing stretches to fit the voice, and the music is ducked under it. |
| **Visuals** | 13 animated horror scenes (forest, haunted house, hallway, mirror, lake, text messages…) with fog, rain, lightning, shake, glitch and flicker. You can also generate an AI image or upload your own image per scene. |
| **Sound design** | A procedural, mood-driven score plus 14 synthesized effects (heartbeat, whisper, knock, stinger, thunder, music box…). No audio files are needed. |
| **Captions** | Word-by-word captions in three styles (Bold, Typewriter, Creepy), plus an optional title card. |
| **Server rendering** | Renders an H.264/AAC MP4 at 1080p or 720p. Frames are split across CPU cores, and you can keep editing (or close the tab) while it renders. |
| **UI** | A bento-grid design with light and dark themes. It also works on phones. |

## How it works

```
 Browser (React)                            Server (Next.js route handlers)
 ─────────────────                          ───────────────────────────────
 Editor ── autosave ─────────────────────▶  SQLite (node:sqlite) + media files in DATA_DIR
 Generate scenes ────────────────────────▶  Claude (structured output)  | offline planner
 Generate narration ─────────────────────▶  ElevenLabs / OpenAI TTS → MP3 → duration → fit timing
 AI image / upload ──────────────────────▶  OpenAI images → PNG
 Live preview: canvas + Web Audio            Render MP4 → job queue → worker process
   (lib/engine, same code as the server)       ├─ OfflineAudioContext (node-web-audio-api) → WAV
                                               ├─ N processes draw frames (@napi-rs/canvas) → x264
                                               └─ ffmpeg concat + mux → MP4 + poster
```

The scene renderer (`lib/engine/renderer.ts`, `visuals.ts`) and the sound engine (`lib/engine/audio.ts`) are isomorphic. The same code drives the live browser preview and the final server render, so what you preview is what you get.

## Quick start

Requirements: **Node 22.5+** (uses the built-in `node:sqlite`) and **ffmpeg** on the `PATH`. On Linux, `libasound2` is also required by the audio renderer.

```bash
npm install
cp .env.example .env.local   # optional: add API keys
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Docker (ffmpeg and libasound2 included; data persists in the volume):

```bash
docker build -t nightshade .
docker run -p 3000:3000 -v nightshade-data:/data \
  -e ANTHROPIC_API_KEY=... -e OPENAI_API_KEY=... nightshade
```

### API keys

All keys are optional. Each one unlocks a feature:

| Variable | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | Claude scene direction (model `claude-opus-5-5`, override with `CLAUDE_MODEL`) |
| `ELEVENLABS_API_KEY` | Narration with ElevenLabs voices (your account's voice list is loaded automatically) |
| `OPENAI_API_KEY` | Narration with OpenAI `gpt-4o-mini-tts` (if no ElevenLabs key) **and** AI scene images (`gpt-image-1`) |

See `.env.example` for every option, including render tuning and the storage location.

## Render performance

Rendering is CPU-bound. On a 4-core machine a 1080p video renders in about 1.7× its length, so a 30s short takes about 50s. 720p is roughly twice as fast. Tuning options:

- `RENDER_PROCESSES` sets the frame-render processes per video (default: CPU count).
- `RENDER_WORKERS` sets how many videos render at once (default: 1).
- `X264_PRESET` trades encode speed for file size.

Output is capped at about 8 Mbps (1080p) or 5 Mbps (720p).

## Project layout

```
app/                     Next.js App Router: pages + /api route handlers
  studio/                dashboard, video library, editor ([id])
  api/                   auth, projects, plan, narration, scene images, renders, media (range-aware)
components/              React UI (bento design system, editor, shell)
lib/engine/              isomorphic: types, planner, scene painters, renderer, sound engine
lib/server/              db, auth, storage, Claude planner, TTS, images, render pipeline + queue
lib/client/              browser preview player, canvas platform, fetch helper
scripts/render-worker.ts background render worker (spawned automatically)
public/fonts/            caption + UI fonts (OFL), shared by browser and server renderer
tests/                   node:test unit tests
```

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (planner, validation, access control, WAV encoder) |
| `npm run typecheck` | TypeScript |
| `npm run worker` | Run the render worker manually; it is normally spawned on demand |

## Limits and notes

- **Single server:** the database is SQLite and the media files live on the local disk in `DATA_DIR`. Run one instance, or move to Postgres plus object storage to scale out.
- **Abuse limits:** AI endpoints are rate-limited per user, in memory: 60 plans, 300 narration clips and 100 images per hour.
- **Plain-HTTP deployments:** session cookies are `Secure` in production. When serving over plain HTTP on a host other than localhost, set `INSECURE_COOKIES=1`.
- **Fonts:** Creepster, Oswald, Special Elite and Plus Jakarta Sans are under the SIL Open Font License.
