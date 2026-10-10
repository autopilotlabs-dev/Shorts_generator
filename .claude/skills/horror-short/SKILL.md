---
name: horror-short
description: Direct and render a 3D cartoon horror short (10-60s vertical video) from a story, fully locally and free. Claude writes the scene spec (sets, characters, camera, narration, sound), checks preview stills, then renders the MP4 with Kokoro voice + Remotion 3D on the CPU.
when_to_use: The user wants to make a horror short / scary story video / 3D cartoon horror animation, or invokes /horror-short with a story or idea.
argument-hint: "[story text, idea, or existing short name]"
allowed-tools: Bash(npm run short *) Read Write Edit
---

# Direct a 3D cartoon horror short

You are the director. The user gives a story or an idea: $ARGUMENTS

Everything renders locally on the user's machine for free (Kokoro TTS + Remotion/Three.js on the CPU). Your job is to turn the story into a great `shorts/<name>/short.json`, check it visually, and render it.

## Workflow

1. **Story.** If the user gave a full story, keep their words for the narration (trim lightly). If they gave an idea, write a tight story yourself. Target **30-45 seconds**: roughly **60-95 narrated words** across **4-8 scenes**, one or two short sentences per scene. Hook in the first line, escalate, end on the scariest beat.
2. **Create** the short: `npm run short -- new <name>` (lowercase-with-dashes name), then overwrite `shorts/<name>/short.json`. Read [reference.md](reference.md) for every field and the directing guide before writing it.
3. **Validate:** `npm run short -- check <name>`. Fix every reported problem and re-run until it says OK.
4. **Preview:** `npm run short -- preview <name>`. This voices the narration and renders one still per scene into `shorts/<name>/preview/`. **Read every PNG** and critique it like a director:
   - Is the subject in frame and readable (not cut off, not too tiny, not hidden behind props)?
   - Is it too dark to see? Raise `fog` less, add a `lamp`/`candle` prop, switch `keyLight`, or change mood.
   - Do captions cover the face? Change shot (`wide`/`medium`) or move the actor (`z`, `x`).
   - Does the sequence escalate (shots get tighter, moods darker)?
   Fix the spec and preview again. **At most 2-3 preview rounds** - the user is on a usage-limited plan.
   Use `npm run short -- preview <name> --frames` to see the start/middle/end of each scene when a move matters.
5. **Render:** `npm run short -- render <name>`. It takes a few minutes on a laptop CPU (roughly 6-7x the video length at 720p). Tell the user the output path: `shorts/<name>/out/<name>.mp4`.

## Rules

- Total length must be 10-60s. Scene duration is fitted to the narration automatically; only set `duration` for silent beats (which then require it).
- Keep the same `outfit`/`hair` colours for a recurring character across scenes, and reuse the same actor `id`.
- Keep scenes light for CPU rendering: at most 3 actors and ~8 props per scene.
- Prefer the built-in kit. Only write a custom scene (`scenes/<id>.tsx`) when the story needs something the kit can't show - see the custom scene section in reference.md.
- Don't invent fields; the validator rejects unknown values.
- If a command fails, read the error, fix the spec (or the custom scene), and re-run. Don't loop more than three times on the same error - explain it to the user instead.
