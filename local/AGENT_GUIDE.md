# Agent guide: making a horror short on this laptop

You (the coding agent, e.g. Antigravity) are the **writer, director and illustrator**.
The script `npm run short` does the voice, sound design, animation and MP4 export.

## Hard rules (the laptop is a 2-core i3 with no GPU and ~4 GB free RAM)

- **Never** install or run local AI models: no Stable Diffusion, ComfyUI, Ollama, Wan, LTX, Whisper, PyTorch, CUDA.
- **Never** use API keys or paid services. Never start `npm run dev`, `npm run worker`, Docker, Postgres or Redis.
- Run **one** heavy command at a time. Rendering takes several minutes, so wait for it to finish; don't start it twice.
- Generate images **with your own built-in image tool only**, one at a time.
- Only write inside `local/projects/<slug>/`. Don't edit the engine code unless the user asks you to.

## Steps for each video

1. Pick a short slug, e.g. `dollhouse`. Create `local/projects/<slug>/`.
2. Write the story, then `plan.json` (format below). **5–8 scenes, 25–45 seconds total.**
   Each scene's `text` is one or two short sentences (about 8–18 words). It is both narrated and shown as captions.
   - Scene 1 is the hook: something wrong, right away.
   - Build dread in the middle scenes.
   - End on a twist or a line that makes people rewatch.
   - Keep it creepy, not gory: cute 3D characters in unsettling situations.
3. For every scene, generate a **vertical 9:16** image with your image tool. Use the scene's `imagePrompt` plus the style lock below.
   Save the images as `local/projects/<slug>/images/01.png`, `02.png`, ... (the number is the scene number).
   Keep characters consistent: repeat the exact character description in every prompt.
   If an image fails, skip it; that scene falls back to built-in animated art.
4. Run: `npm run short -- <slug> --draft` (720p, faster). Check the result. When happy, run `npm run short -- <slug>` (1080p).
5. Tell the user the path `local/projects/<slug>/final.mp4`.
   Also give them a YouTube Shorts title (under 60 characters), a 2-line description and 5 hashtags.

## Style lock (append to every image prompt)

> 3D animated feature film still, Pixar-like stylized characters, big expressive eyes, soft subsurface skin, cinematic volumetric lighting, cozy-but-wrong atmosphere, eerie rim light, teal and amber palette with deep shadows, shallow depth of field, highly detailed render, vertical 9:16 composition, no text, no watermark, no gore

## plan.json format

```json
{
  "title": "The Dollhouse",
  "captionStyle": "bold",
  "showTitle": true,
  "music": 1,
  "sfxVolume": 1,
  "voice": { "engine": "auto", "rate": -2 },
  "scenes": [
    {
      "text": "Every night, Pip the toy robot checks the dollhouse.",
      "visual": "house",
      "mood": "eerie",
      "effects": ["zoom", "dust"],
      "sfx": ["musicbox"],
      "imagePrompt": "A tiny cute toy robot with big glowing round eyes in front of an old wooden dollhouse, child's bedroom at night"
    }
  ]
}
```

Allowed values (anything else is ignored):

| field | values |
|---|---|
| `captionStyle` | `bold`, `typewriter`, `creepy` |
| `visual` (fallback art when there is no image) | `forest`, `house`, `hallway`, `figure`, `eyes`, `moon`, `graveyard`, `door`, `mirror`, `water`, `room`, `phone`, `void` |
| `mood` (colour grade + music) | `dread`, `tension`, `terror`, `eerie`, `sad` |
| `effects` (camera + overlays) | `fog`, `rain`, `lightning`, `shake`, `glitch`, `flicker`, `dust`, `zoom` |
| `sfx` | `heartbeat`, `creak`, `whisper`, `stinger`, `thunder`, `rain`, `footsteps`, `knock`, `musicbox`, `scream`, `glitch`, `buzz`, `drip`, `bell` |
| `voice.engine` | `auto` (Piper if set up, else the Windows voice), `windows`, `piper`, `none` |
| `voice.rate` | Windows voice speed, -10..10 (−2 = slow and creepy) |
| `voice.windowsVoice` | e.g. `Microsoft David Desktop` or `Microsoft Zira Desktop` |
| `voice.piperModel` | path to a Piper `.onnx` voice (relative to the project folder) |
| `duration` | seconds, only used for scenes **without** narration (scenes with a voice clip are timed to it) |

Tips:
- Put `zoom` on most scenes; it gives stills a slow camera push.
- Use `shake` + `stinger` on the scare, and `glitch` sparingly.
- One `terror` scene near the end is more effective than many.
- Users can drop their own recordings into `voice/01.wav`, `02.wav`, ... These replace the synthetic voice for those scenes.
