import assert from "node:assert/strict";
import { test } from "node:test";
import { planLocally, splitSentences } from "../shared/planner";
import { fitDurations, totalDuration, MIN_SCENE, type Scene } from "../shared/types";
import { SAMPLES } from "../src/samples";

test("splitSentences keeps punctuation and trailing fragments", () => {
  assert.deepEqual(splitSentences("I heard it. Then nothing! Was it gone"), ["I heard it.", "Then nothing!", "Was it gone"]);
});

for (const seconds of [10, 30, 60]) {
  test(`local plan fits exactly ${seconds}s`, () => {
    for (const s of SAMPLES) {
      const plan = planLocally(s.story, seconds);
      assert.ok(Math.abs(totalDuration(plan) - seconds) < 0.05, `got ${totalDuration(plan)}`);
      assert.ok(plan.scenes.length >= 2);
      for (const sc of plan.scenes) assert.ok(sc.duration >= MIN_SCENE - 0.05, `scene too short: ${sc.duration}`);
      // nothing from the story is dropped
      assert.equal(plan.scenes.map((x) => x.text).join(" "), splitSentences(s.story).join(" "));
      assert.equal(plan.scenes.at(-1)!.mood, "terror");
    }
  });
}

test("durations are clamped to 10-60s", () => {
  assert.ok(Math.abs(totalDuration(planLocally(SAMPLES[0].story, 3)) - 10) < 0.05);
  assert.ok(Math.abs(totalDuration(planLocally(SAMPLES[0].story, 600)) - 60) < 0.05);
});

test("fitDurations keeps relative weights", () => {
  const base = { text: "", visual: "moon", mood: "dread", effects: [], sfx: [] } as const;
  const scenes: Scene[] = [
    { ...base, id: "a", duration: 1, effects: [], sfx: [] },
    { ...base, id: "b", duration: 3, effects: [], sfx: [] },
  ];
  const out = fitDurations(scenes, 20);
  assert.ok(out[1].duration > out[0].duration);
  assert.ok(Math.abs(out[0].duration + out[1].duration - 20) < 0.01);
});

test("one-sentence story still produces a playable plan", () => {
  const plan = planLocally("Something was breathing under my bed.", 15);
  assert.equal(plan.scenes.length, 1);
  assert.ok(Math.abs(totalDuration(plan) - 15) < 0.05);
});
