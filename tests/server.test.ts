import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "nightshade-test-"));

const { fitToNarration, NARRATION_LEAD, NARRATION_TAIL } = await import("../lib/engine/types");
const { encodeWav } = await import("../lib/engine/soundtrack");
const { isSafeKey, signKey, storage, verifySignature } = await import("../lib/server/storage");
const { validatePlan } = await import("../lib/server/validate");

test("fitToNarration stretches scenes to fit their voice clip", () => {
  const [a, b] = fitToNarration([
    { id: "a", text: "x", visual: "moon", mood: "dread", duration: 2, effects: [], sfx: [], narration: { key: "u/p/v.mp3", duration: 4, voice: "onyx", text: "x" } },
    { id: "b", text: "y", visual: "moon", mood: "dread", duration: 3, effects: [], sfx: [] },
  ]);
  assert.equal(a.duration, Math.round((4 + NARRATION_LEAD + NARRATION_TAIL) * 10) / 10);
  assert.equal(b.duration, 3);
});

test("storage keys reject traversal and odd characters", () => {
  assert.ok(isSafeKey("user123/p_abc/img-1.png"));
  assert.ok(!isSafeKey("user123/../other/x.png"));
  assert.ok(!isSafeKey("/etc/passwd"));
  assert.ok(!isSafeKey("user123"));
  assert.ok(!isSafeKey("user123/p/x?.png"));
});

test("signed media URLs verify and expire", () => {
  const key = "u1/p1/renders/a.wav";
  const future = Math.floor(Date.now() / 1000) + 60;
  const sig = signKey(key, future);
  assert.ok(verifySignature(key, String(future), sig));
  assert.ok(!verifySignature("u2/p1/renders/a.wav", String(future), sig), "signature is bound to the key");
  const past = Math.floor(Date.now() / 1000) - 1;
  assert.ok(!verifySignature(key, String(past), signKey(key, past)), "expired");
  assert.ok(!verifySignature(key, null, sig));
});

test("local storage round-trips with HTTP ranges", async () => {
  const s = storage();
  await s.put("u1/p1/hello.mp3", Buffer.from("0123456789"), "audio/mpeg");
  assert.equal((await s.read("u1/p1/hello.mp3")).toString(), "0123456789");
  const part = await s.open("u1/p1/hello.mp3", "bytes=2-5");
  assert.equal(part?.status, 206);
  assert.equal(part?.range, "bytes 2-5/10");
  assert.equal(await new Response(part!.body).text(), "2345");
  await s.deletePrefix("u1/p1");
  assert.equal(await s.open("u1/p1/hello.mp3"), null);
});

test("validatePlan sanitises scenes and only keeps this project's media", () => {
  const plan = validatePlan(
    {
      title: "t",
      scenes: [
        {
          id: "s1",
          text: "hello",
          visual: "nope",
          mood: "terror",
          duration: 99,
          effects: ["fog", "fog", "bad"],
          sfx: ["knock", "nuke"],
          imageKey: "u_other/p1/x.png",
          narration: { key: "u_me/p1/v.mp3", duration: 2, voice: "onyx", text: "hello" },
        },
      ],
    },
    "u_me",
    "p1",
  );
  const s = plan.scenes[0];
  assert.equal(s.visual, "void");
  assert.equal(s.duration, 20);
  assert.deepEqual(s.effects, ["fog"]);
  assert.deepEqual(s.sfx, ["knock"]);
  assert.equal(s.imageKey, undefined);
  assert.equal(s.narration?.key, "u_me/p1/v.mp3");
});

test("encodeWav writes a valid 16-bit PCM file", () => {
  const ch = [new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0, 0.25, -0.25, -1])];
  const buf = { numberOfChannels: 2, length: 4, sampleRate: 48000, getChannelData: (c: number) => ch[c] } as unknown as AudioBuffer;
  const wav = Buffer.from(encodeWav(buf));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.length, 44 + 4 * 2 * 2);
  assert.equal(wav.readInt16LE(44 + 12), 32767);
});

test("projects are scoped to their owner (Postgres)", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, async () => {
  const { db } = await import("../db");
  const { user } = await import("../db/auth-schema");
  const { inArray } = await import("drizzle-orm");
  const { createProject, getProject, updateProject, listProjects, deleteProject } = await import("../lib/server/projects");
  const ids = [`test_${Date.now()}_a`, `test_${Date.now()}_b`];
  await db.insert(user).values(ids.map((id) => ({ id, name: "T", email: `${id}@test.dev` })));
  try {
    const [alice, bob] = ids;
    const p = await createProject(alice, { title: "Mine", story: "story", duration: 99 });
    assert.equal(p.duration, 60);
    assert.equal(await getProject(bob, p.id), null);
    assert.equal(await updateProject(bob, p.id, { title: "stolen" }), null);
    assert.equal(await deleteProject(bob, p.id), false);
    assert.equal((await updateProject(alice, p.id, { title: "Renamed" }))?.title, "Renamed");
    assert.equal((await listProjects(bob)).length, 0);
    assert.equal(await deleteProject(alice, p.id), true);
  } finally {
    await db.delete(user).where(inArray(user.id, ids));
  }
});
