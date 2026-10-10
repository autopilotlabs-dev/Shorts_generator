# Local horror shorts (no API keys, runs on a basic laptop)

Your coding agent (Antigravity) writes the story and draws the images.
This folder turns them into a narrated, captioned, scored 9:16 MP4. Everything runs offline after setup.

```
agent writes plan.json ─┐
agent draws images/NN.png ─┼─► npm run short -- <slug> ─► voice (Windows / Piper) ─► score + SFX ─► Remotion ─► final.mp4
your own voice/NN.wav (optional) ─┘
```

There is no database, Redis, web server or API key. The process runs at below-normal priority, so the laptop stays usable while it renders.

## One-time setup (Windows)

1. Install **Node.js 22 LTS** from nodejs.org. Close and reopen your terminal afterwards.
2. In the project folder:
   ```powershell
   npm install
   npx remotion browser ensure
   ```
3. Test it:
   ```powershell
   npm run short -- example --draft
   ```
   This writes `local\projects\example\final.mp4`. The first run is slower because it builds the renderer once.

The narrator voice uses Windows' built-in speech engine, so there's nothing to install.

### Better voice (optional, still free and offline): Piper

The Windows voice sounds robotic. Piper sounds far more natural and runs fast on a CPU.

1. Download `piper_windows_amd64.zip` from https://github.com/rhasspy/piper/releases (release 2023.11.14-2) and unzip it, e.g. to `C:\piper`.
2. Download a voice (`.onnx` **and** `.onnx.json`) from https://huggingface.co/rhasspy/piper-voices.
   Deep voices that suit horror: `en_US-ryan-high`, `en_GB-alan-medium`, `en_US-joe-medium`.
3. Point the script at them (PowerShell, once per terminal, or set them as user environment variables):
   ```powershell
   $env:PIPER_EXE = "C:\piper\piper.exe"
   $env:PIPER_MODEL = "C:\piper\voices\en_US-ryan-high.onnx"
   ```
   With `"engine": "auto"`, Piper is now used automatically.

## Making a video

1. Open this repo in Antigravity and paste the prompt from the "Prompt for Antigravity" section below.
2. Or by hand: create `local/projects/<slug>/plan.json` (see `AGENT_GUIDE.md`) and put images in `images/01.png`, `02.png`, ...
3. Run `npm run short -- <slug> --draft` for a quick 720p check, then `npm run short -- <slug>` for 1080p.

Output files in `local/projects/<slug>/`:
- `final.mp4`: the video
- `thumbnail.jpg`: a frame from the opening
- `image-prompts.txt`: every scene's prompt, ready to paste into any image generator
- `voice/NN.tts.wav`: cached narration. It is regenerated only when a scene's text changes.

Options:

| flag | meaning |
|---|---|
| `--draft` | 720p, about 2× faster |
| `--voice windows\|piper\|none` | override the voice engine |
| `--concurrency 1` | render with one browser tab (lowest memory). This is the default when less than 6 GB of RAM is free. |

Scenes without an image use the built-in animated horror art, so a video always renders.

## Prompt for Antigravity

```
Read local/AGENT_GUIDE.md and follow it exactly. Make a horror short about:
<your idea, e.g. "a toy robot finds the dolls waiting for it">
Generate the images yourself, one per scene, saved in the project's images folder.
Then render with --draft, check it, and render the final 1080p version.
```

## Rough timings on a 2-core i3 laptop

These are estimates. Rendering is CPU-bound, at about 1–3× the video length for 720p and 3–6× for 1080p. A 40-second short should finish in roughly 2–8 minutes. Close Chrome tabs and other heavy apps while it renders.
