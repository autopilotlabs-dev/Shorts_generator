// Offline, rule-based story planner. Used when no AI key is configured on the
// server (or the server is unreachable), so the app always works.
import {
  clampDuration,
  fitDurations,
  MIN_SCENE,
  type Effect,
  type Mood,
  type Scene,
  type Sfx,
  type StoryPlan,
  type Visual,
} from "./types";

const VISUAL_KEYWORDS: [Visual, RegExp][] = [
  ["eyes", /\b(eyes?|stare[sd]?|staring|watch(ed|ing)?|gaze)\b/i],
  ["mirror", /\b(mirror|reflection|glass)\b/i],
  ["phone", /\b(phone|text(ed)?|message|call(ed)?|screen|notification)\b/i],
  ["door", /\b(door|knock(ed|ing)?|handle|lock(ed)?|basement)\b/i],
  ["figure", /\b(figure|shadow|man|woman|someone|something|silhouette|stranger|it stood|ghost|girl|boy)\b/i],
  ["graveyard", /\b(grave|cemetery|tomb|buried|coffin|funeral|dead)\b/i],
  ["water", /\b(lake|river|water|sea|ocean|drown(ed|ing)?|well|bath)\b/i],
  ["forest", /\b(forest|woods?|trees?|path|trail|cabin)\b/i],
  ["hallway", /\b(hall(way)?|corridor|stairs?|attic)\b/i],
  ["house", /\b(house|home|mansion|building|outside|window)\b/i],
  ["moon", /\b(moon|night|sky|stars?|midnight)\b/i],
  ["room", /\b(room|bed(room)?|light|lamp|bulb|kitchen|closet)\b/i],
];

const SFX_KEYWORDS: [Sfx, RegExp][] = [
  ["knock", /\b(knock(ed|ing|s)?|bang(ed|ing)?|tap(ped|ping)?)\b/i],
  ["footsteps", /\b(steps?|footsteps?|walk(ed|ing)?|running|ran|chase[d]?)\b/i],
  ["whisper", /\b(whisper(ed|ing|s)?|voice|said|name|breath(ing)?|murmur)\b/i],
  ["creak", /\b(creak(ed|ing|s)?|door|floor(boards?)?|open(ed)?)\b/i],
  ["scream", /\b(scream(ed|ing|s)?|shriek|yell(ed)?|cr(y|ied))\b/i],
  ["heartbeat", /\b(heart|pulse|froze|frozen|afraid|fear|terrified)\b/i],
  ["thunder", /\b(storm|thunder|lightning)\b/i],
  ["rain", /\b(rain(ing|ed)?|storm|wet)\b/i],
  ["musicbox", /\b(music|song|sing(ing)?|lullaby|child(ren)?|doll|toy)\b/i],
  ["buzz", /\b(phone|buzz(ed|ing)?|vibrat(e|ed|ing)|notification|text(ed)?)\b/i],
  ["drip", /\b(drip(ping)?|water|blood|wet|sink)\b/i],
  ["bell", /\b(bell|clock|midnight|church|toll)\b/i],
  ["glitch", /\b(static|glitch|camera|video|tv|radio|signal)\b/i],
];

const TERROR = /\b(scream|blood|dead|kill|behind (me|you)|run|grabbed|it was|smil(e|ed|ing)|teeth|face)\b/i;
const TENSION = /\b(suddenly|then|heard|noise|sound|closer|slowly|waiting|silence|quiet)\b/i;
const SAD = /\b(cr(y|ied)|lost|alone|miss(ed)?|gone|grief|mother|father)\b/i;

/** Split into sentences, keeping the punctuation. */
export function splitSentences(story: string): string[] {
  return (story.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+["'”’]?|[^.!?…]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Merge sentences into `count` roughly word-balanced chunks. */
function chunk(sentences: string[], count: number): string[] {
  if (sentences.length <= count) return sentences;
  const total = sentences.reduce((a, s) => a + wordCount(s), 0);
  const per = total / count;
  const out: string[] = [];
  let cur: string[] = [];
  let acc = 0;
  sentences.forEach((s, i) => {
    cur.push(s);
    acc += wordCount(s);
    const remainingSentences = sentences.length - i - 1;
    const remainingSlots = count - out.length - 1;
    // Close the chunk once it reaches its word share, or when every remaining
    // sentence is needed to fill the remaining chunks.
    if (remainingSlots > 0 && (acc >= per * (out.length + 1) || remainingSentences === remainingSlots)) {
      out.push(cur.join(" "));
      cur = [];
    }
  });
  if (cur.length) out.push(cur.join(" "));
  return out;
}

function pick<T>(text: string, table: [T, RegExp][]): T[] {
  return table.filter(([, re]) => re.test(text)).map(([v]) => v);
}

const FALLBACK_VISUALS: Visual[] = ["moon", "forest", "house", "hallway", "room", "figure"];

export function planLocally(story: string, targetSeconds: number, title?: string): StoryPlan {
  const target = clampDuration(targetSeconds);
  const sentences = splitSentences(story);
  if (sentences.length === 0) throw new Error("Story is empty");

  const maxScenes = Math.floor(target / MIN_SCENE);
  const wanted = Math.max(2, Math.min(maxScenes, Math.round(target / 4), 14));
  const chunks = chunk(sentences, wanted);

  let lastVisual: Visual | null = null;
  const scenes: Scene[] = chunks.map((text, i) => {
    const isLast = i === chunks.length - 1;
    const visuals = pick(text, VISUAL_KEYWORDS);
    let visual = visuals.find((v) => v !== lastVisual) ?? visuals[0] ?? FALLBACK_VISUALS[i % FALLBACK_VISUALS.length];
    if (isLast && !visuals.length) visual = "figure";
    lastVisual = visual;

    let mood: Mood = "dread";
    if (SAD.test(text)) mood = "sad";
    if (TENSION.test(text)) mood = "tension";
    if (TERROR.test(text) || isLast) mood = "terror";
    if (i === 0 && mood !== "terror") mood = "eerie";

    const sfx = pick(text, SFX_KEYWORDS).slice(0, 3);
    if (isLast && !sfx.includes("stinger")) sfx.push("stinger");
    if (mood === "tension" && !sfx.length) sfx.push("heartbeat");

    const effects: Effect[] = ["zoom"];
    if (["forest", "graveyard", "water", "moon", "void"].includes(visual)) effects.push("fog");
    if (sfx.includes("rain")) effects.push("rain");
    if (sfx.includes("thunder")) effects.push("lightning");
    if (["room", "hallway", "mirror"].includes(visual)) effects.push("flicker", "dust");
    if (mood === "terror") effects.push("shake");
    if (sfx.includes("glitch") || (isLast && mood === "terror")) effects.push("glitch");

    return {
      id: `s${i + 1}`,
      text,
      visual,
      mood,
      duration: Math.max(1, wordCount(text) / 2.6), // ~2.6 words/sec reading pace as weight
      effects: [...new Set(effects)],
      sfx: [...new Set(sfx)],
    };
  });

  return {
    title: title?.trim() || deriveTitle(sentences[0]),
    scenes: fitDurations(scenes, target),
  };
}

function deriveTitle(first: string): string {
  const words = first.replace(/[^\w\s']/g, "").split(/\s+/).slice(0, 4).join(" ");
  return words.length > 2 ? words.toUpperCase() : "DON'T LOOK BACK";
}
