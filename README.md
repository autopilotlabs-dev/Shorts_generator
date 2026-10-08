# Nightshade — Horror Shorts Generator

Paste a horror story and get a vertical **10–60 second short video** (1080×1920 or 720×1280) with:

- **Animated visuals.** 13 procedurally drawn, animated scenes: forest, haunted house, hallway, approaching figure, eyes in the dark, graveyard, opening door, mirror, lake, bedroom, creepy text messages, moonlit sky, void. You can also upload your own image for any scene; it gets a Ken Burns pan and a horror colour grade.
- **Effects.** Fog, rain, lightning, camera shake, glitch, light flicker, dust, slow push-in, film grain and vignette.
- **Sound design.** A mood-driven drone score, wind and reverb, plus 14 synthesized sound effects: heartbeat, creak, whisper, stinger, thunder, rain, footsteps, knock, music box, scream, glitch, phone buzz, drip and bell. Everything is generated with the Web Audio API, so there are no audio files and nothing to license.
- **Captions.** TikTok-style captions that show a few words at a time and highlight the current word, in three styles (Bold, Typewriter, Creepy), plus a title card.
- **Export.** Recorded in the browser as MP4 (Chrome/Edge) or WebM. The server can convert WebM to H.264 MP4 with ffmpeg.

The UI uses a bento-grid layout with light and dark themes.

## How it works

```
story ──► scene planner ──► editable shot list ──► canvas renderer + Web Audio ──► MediaRecorder ──► .mp4/.webm
          (Claude or offline rules)                (src/render, src/audio)          (src/video)      (ffmpeg → mp4)
```

1. **Planning** (`POST /api/plan`). The story is split into timed scenes. Each scene has a caption, a visual, a mood, effects and sound cues.
   - If `ANTHROPIC_API_KEY` is set, Claude directs the scenes (`server/ai-planner.ts`, using structured outputs).
   - Otherwise a keyword-based planner (`shared/planner.ts`) does it. The browser falls back to the same planner if the server can't be reached, so the app also works as a static site.
2. **Editing.** You can change any scene's caption, visual, mood, duration, sounds and effects, add or delete scenes, or upload an image for a scene. Changing the length slider rescales all scenes to the new total.
3. **Rendering.** The video is drawn frame by frame on a `<canvas>` while the soundtrack plays. Both are captured with `MediaRecorder` in real time, so a 30s video takes about 30s to render. Keep the tab visible while it renders.

## Run it

Requires Node 20+. ffmpeg is optional and only needed for WebM→MP4 conversion.

```bash
npm install
npm run dev          # web on http://localhost:5173, API on :8787
```

Production:

```bash
npm run build
npm start            # serves dist/ and the API on http://localhost:8787 (PORT to override)
```

### Enable the AI director (optional)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# optional: CLAUDE_MODEL=claude-opus-5-5 (default)
npm start
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + API with reload |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Serve the built app + API |
| `npm test` | Planner unit tests |
| `npm run typecheck` | TypeScript check |

## Project layout

```
shared/        types + offline planner (used by browser and server)
server/        Express API: /api/health, /api/plan, /api/convert
src/render/    procedural scenes (visuals.ts) and frame compositor (renderer.ts)
src/audio/     Web Audio sound engine
src/video/     preview playback + MediaRecorder export
src/main.ts    UI logic; index.html + src/style.css for the bento UI
```

## Ideas for next steps

- Voice-over narration through a TTS API, mixed into the soundtrack
- AI image generation per scene (each scene already supports a custom image)
- Server-side rendering (headless browser) for faster-than-real-time exports
