# short.json reference

```jsonc
{
  "title": "The Knock",          // shown on the title card (2-5 words)
  "voice": "am_onyx",            // narrator (see Voices)
  "speed": 0.92,                 // 0.7-1.2; horror reads best around 0.88-0.95
  "captionStyle": "bold",        // bold | typewriter | creepy
  "showTitle": true,
  "quality": 720,                // 720 (fast, default) | 1080 (≈2x slower)
  "music": 1, "sfxVolume": 1, "voiceVolume": 1,   // 0-1.5 mix levels
  "scenes": [ /* 1-20 scenes, see below */ ]
}
```

## Scene

| Field | Values | Notes |
|---|---|---|
| `id` | `s1`, `s2`… | lowercase, unique |
| `narration` | text ≤ 300 chars | read aloud + captions. One or two sentences. |
| `duration` | 1.5-15 s | omit to fit narration; required if no narration |
| `set` | `bedroom` `hallway` `house_exterior` `forest` `graveyard` `lake` `basement` `void` | the location |
| `mood` | `dread` `tension` `terror` `eerie` `sad` | colour grade + music |
| `keyLight` | `moon` `lamp` `flashlight` `candle` `tv` `lightning` `red_emergency` `none` | main light |
| `flicker` | true/false | unstable light |
| `fog` | 0-1 | 0.3 light haze, 0.6 spooky, 0.9 very thick (hides background) |
| `weather` | `none` `rain` `snow` `fireflies` `dust` | particles |
| `camera` | `{ "shot", "move", "target", "intensity" }` | see Camera |
| `actors` | up to 5 (keep ≤ 3) | see Actors |
| `props` | up to 15 (keep ≤ 8) | see Props |
| `sfx` | up to 4 of `heartbeat` `creak` `whisper` `stinger` `thunder` `rain` `footsteps` `knock` `musicbox` `scream` `glitch` `buzz` `drip` `bell` | synthesized sound effects |
| `effects` | up to 4 of `glitch` `flicker` `lightning` `shake` | 2D post effects on top of the 3D image |
| `custom` | `"scenes/<name>.tsx"` | optional hand-written 3D content added to the scene |

### Coordinates

The camera looks from the front (+z) into the scene (-z). Actors stand at `x` -2..2 (left/right), `z` 0 is the main mark, negative `z` is further away (e.g. `-5` deep in the background), positive is closer to camera (max 3).

### Actors

| Field | Values |
|---|---|
| `id` | name used by `camera.target`; reuse it across scenes for the same character |
| `character` | `kid` `adult` `ghost` `monster` `shadow_figure` `doll` `cat` |
| `action` | `idle` `walk_in` `walk_away` `walk_left` `walk_right` `look_around` `scared` `run` `peek` `float` `creep_closer` `reveal` `sleep` `turn_around` |
| `expression` | `neutral` `scared` `surprised` `smile` `creepy_smile` `angry` `closed` |
| `facing` | `camera` `left` `right` `away` (some actions override it) |
| `x`, `z` | position (see Coordinates) |
| `start` | seconds into the scene when the action begins (e.g. a `reveal` at 1.5) |
| `scale` | 0.3-3 (a 1.6 monster towers over a kid) |
| `outfit`, `hair`, `skin` | `#rrggbb` colours |
| `glowingEyes` | true for monsters, possessed dolls, eyes in the dark |

Action notes: `walk_in` approaches the mark from 5 m back; `walk_away` leaves into the distance (seen from behind); `run` is a panicked sprint toward camera; `creep_closer` slowly advances over the whole scene - great for a figure behind the hero; `reveal` rises/fades in (use `start` to time the scare); `sleep` lies down - put the actor on a `bed` prop at the same x/z; `peek` leans out from the side; `turn_around` starts facing away and turns to camera.

### Props

`type`: `bed` `lamp` `door` `window` `mirror` `closet` `chair` `table` `tv` `phone` `teddy` `candle` `tree` `dead_tree` `grave` `fence` `pumpkin` `lantern` `stairs` `box` `rocking_chair` `music_box`

Fields: `x`, `z`, `rotation` (degrees), `scale`, `color`, `active`, `start`.
`active: true` animates the prop from `start` seconds: door/closet creak open (eyes appear in the gap), lamp/tv/candle/pumpkin light up, phone screen glows, window shows a silhouette, mirror shows a pale face, rocking_chair rocks by itself, music_box spins, teddy's eyes glow red.

Sets already contain their basics (bedroom has a window; forest has trees and a path; house_exterior has the house, dead trees and fence; graveyard has graves; basement has stairs, boxes and a bulb). Add props for story beats.

### Camera

| `shot` | Use for |
|---|---|
| `extreme_wide` | establishing the location, characters tiny |
| `wide` | full body + surroundings |
| `medium` | waist up - default for dialogue/narration beats |
| `closeup` | face - reactions, fear |
| `extreme_closeup` | eyes - the scariest beat |
| `low_angle` | makes monsters huge and threatening |
| `high_angle` | makes the victim small and vulnerable |
| `over_shoulder` | behind the hero, looking at what they see |
| `pov` | first-person, slight walking bob |

`move`: `static` `dolly_in` (slow push - default tension) `dolly_out` (reveal surroundings) `pan_left` `pan_right` `orbit_left` `orbit_right` `tilt_up` (from feet up to a monster's face) `crane_down` `handheld` (nervous) `shake` (panic, gets stronger) `push_in_fast` (jump scare).
`target`: actor id to frame (defaults to the first actor). `intensity`: 0-2.

## Directing guide

- **Escalate:** wide/eerie → medium/tension → closeup/terror. Moods should get darker; shots tighter.
- **Show the threat late:** first a sound (`sfx: whisper/knock/footsteps`), then a hint (glowing eyes in a doorway, a `shadow_figure` far back with `creep_closer`), then the reveal (`reveal` + `low_angle` + `stinger`).
- **Jump scare beat:** short narration, `push_in_fast` or `shake`, `sfx: ["stinger"]`, `effects: ["glitch"]` or `["flicker"]`, mood `terror`.
- **Light the face:** with `fog` ≥ 0.7 or `keyLight: "none"`, add a `candle`, `lamp` (active) or `lantern` near the hero, or the image goes black.
- **Captions sit in the lower-middle third.** For close-ups that's the mouth/chin - fine. Don't put a key detail there.
- **Silence is scary:** a 2 s scene with no narration (`duration: 2`) and one sound effect can land harder than words.

## Voices (Kokoro)

Male: `am_onyx` (deep, default), `am_michael`, `am_adam`, `am_fenrir`, `am_echo`, `am_eric`, `am_liam`, `am_puck`, British `bm_george`, `bm_lewis`, `bm_daniel`, `bm_fable`.
Female: `af_heart` (best quality), `af_bella`, `af_nicole` (soft/whispery), `af_sky`, `af_sarah`, `af_nova`, `af_river`, British `bf_emma`, `bf_isabella`, `bf_alice`, `bf_lily`.

## Custom scenes (only when needed)

`"custom": "scenes/s5.tsx"` adds your own React Three Fiber content to a scene (the set, lights, fog, actors and camera still apply; use `"set": "void"` for a blank stage). The file must default-export a component:

```tsx
// shorts/<name>/scenes/s5.tsx
import type { CustomSceneProps } from "../../../remotion/short3d/HorrorShort3D";

export default function Scene({ t, duration }: CustomSceneProps) {
  const rise = Math.min(1, t / 2); // animate ONLY from t (seconds into the scene)
  return (
    <mesh position={[0, -1 + rise * 1.5, -2]}>
      <torusKnotGeometry args={[0.5, 0.15, 96, 16]} />
      <meshStandardMaterial color="#5a1020" emissive="#ff2a2a" emissiveIntensity={0.4} />
    </mesh>
  );
}
```

Rules: animate only from `t` (never `useFrame`, timers, or `Math.random()` - every frame must be reproducible); only import from `react`, `three`, `@react-three/fiber`, and this repo's `remotion/short3d/*` (e.g. reuse `Toon` from `remotion/short3d/materials`); keep geometry light (CPU rendering).
