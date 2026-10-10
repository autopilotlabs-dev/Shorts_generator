import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NARRATION_LEAD, NARRATION_TAIL } from "../lib/engine/types";
import { resolveTiming, totalOf } from "../lib/short3d/pipeline";
import { ShortSchema } from "../lib/short3d/spec";

const template = JSON.parse(readFileSync(new URL("../shorts/_template/short.json", import.meta.url), "utf8"));

test("the bundled template is a valid short", () => {
  const r = ShortSchema.safeParse(template);
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
});

test("validator reports unknown values", () => {
  const bad = structuredClone(template);
  bad.scenes[0].set = "spaceship";
  bad.scenes[1].actors[0].action = "dance";
  const r = ShortSchema.safeParse(bad);
  assert.ok(!r.success);
  const paths = r.error.issues.map((i) => i.path.join("."));
  assert.ok(paths.includes("scenes.0.set"));
  assert.ok(paths.includes("scenes.1.actors.0.action"));
});

test("validator reports bad camera targets, silent scenes without duration and duplicate ids", () => {
  const bad = structuredClone(template);
  bad.scenes[1].camera.target = "nobody";
  bad.scenes[2].narration = "";
  bad.scenes.push({ ...bad.scenes[3] }); // duplicate id
  const r = ShortSchema.safeParse(bad);
  assert.ok(!r.success);
  const paths = r.error.issues.map((i) => i.path.join("."));
  assert.ok(paths.includes("scenes.1.camera.target"));
  assert.ok(paths.includes("scenes.2.duration"));
  assert.ok(paths.includes("scenes.4.id"));
});

test("scene timing fits narration and chains start times", () => {
  const spec = ShortSchema.parse(template);
  spec.scenes[3].duration = 2.5; // explicit duration wins
  const voices = new Map([
    ["s1", { file: "a.wav", duration: 4 }],
    ["s2", { file: "b.wav", duration: 3 }],
    ["s3", { file: "c.wav", duration: 2 }],
    ["s4", { file: "d.wav", duration: 9 }],
  ]);
  const r = resolveTiming(spec, voices);
  assert.equal(r.scenes[0].duration, 4 + NARRATION_LEAD + NARRATION_TAIL);
  assert.equal(r.scenes[1].start, r.scenes[0].duration);
  assert.equal(r.scenes[3].duration, 2.5);
  assert.ok(Math.abs(totalOf(r) - (4 + 3 + 2 + 3 * (NARRATION_LEAD + NARRATION_TAIL) + 2.5)) < 0.01);
});
