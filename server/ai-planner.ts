// Claude-powered scene director: turns a raw story into a timed shot list.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { clampDuration, EFFECTS, fitDurations, MOODS, SFX, VISUALS, type StoryPlan } from "../shared/types";

const PlanSchema = z.object({
  title: z.string().describe("Short, punchy title in 2-5 words"),
  scenes: z.array(
    z.object({
      text: z.string().describe("On-screen caption for this beat, max ~22 words"),
      visual: z.enum(VISUALS),
      mood: z.enum(MOODS),
      weight: z.number().describe("Relative screen time for this scene, 1-10"),
      effects: z.array(z.enum(EFFECTS)),
      sfx: z.array(z.enum(SFX)),
    }),
  ),
});

const SYSTEM = `You are the director of vertical horror short videos (YouTube Shorts / TikTok / Reels).
Given a story and a target length, break it into a sequence of scenes for an animated slideshow-style short.

Rules:
- Keep the story's own words where possible, but trim captions so each can be read in its screen time (~2.5 words per second).
- Scene count: roughly one scene per 3-5 seconds of target length. Never fewer than 2.
- Open with a hook, build tension, and end on the scariest beat (mood "terror", sfx including "stinger").
- Pick the "visual" that best depicts each beat from the allowed list. Use "void" for abstract/black beats.
- Choose 0-3 sfx and 1-4 effects per scene that fit what is happening. Don't put every effect everywhere; restraint makes the scares land.
- "weight" controls relative duration: longer captions and slow-burn beats get more weight; jump-scare beats get less.`;

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function planWithClaude(story: string, seconds: number, title?: string): Promise<StoryPlan> {
  client ??= new Anthropic();
  const target = clampDuration(seconds);

  const response = await client.beta.messages.parse({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Target length: ${target} seconds.${title ? `\nWorking title: ${title}` : ""}\n\n<story>\n${story}\n</story>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to plan this story.");
  const parsed = response.parsed_output;
  if (!parsed || parsed.scenes.length === 0) throw new Error("The model returned an empty plan.");

  const scenes = parsed.scenes.map((s, i) => ({
    id: `s${i + 1}`,
    text: s.text,
    visual: s.visual,
    mood: s.mood,
    duration: Math.min(10, Math.max(1, s.weight)),
    effects: [...new Set(s.effects)],
    sfx: [...new Set(s.sfx)],
  }));
  return { title: title?.trim() || parsed.title, scenes: fitDurations(scenes, target) };
}
