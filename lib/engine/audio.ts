// Procedural horror sound design with the Web Audio API: a mood-driven drone
// score, wind, reverb, synthesized SFX and narration, scheduled per scene.
// Works with a live AudioContext (browser preview) or an OfflineAudioContext
// (server render via node-web-audio-api).
import { NARRATION_LEAD, type Mood, type Scene, type Sfx, type StoryPlan } from "./types";
import { rng, sceneSeed, strikeTimes } from "./util";

const ROOT: Record<Mood, number> = { dread: 55, tension: 49, terror: 46.25, eerie: 61.74, sad: 41.2 };
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];
const semis = (f: number, s: number) => f * Math.pow(2, s / 12);

export interface Mix {
  music: number;
  sfx: number;
  voice: number;
}

/** Narration clips keyed by their URL (see Scene.narration.url). */
export type VoiceBank = Map<string, AudioBuffer>;

/** Automation times must be non-negative; previewing from mid-video can produce earlier times. */
const T = (t: number) => Math.max(0, t);

/** Music level while the narrator is speaking. */
const DUCK = 0.4;

export class SoundEngine {
  private master: GainNode;
  private reverb: ConvolverNode;
  private noise: AudioBuffer;
  private session: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];

  constructor(
    readonly ctx: BaseAudioContext,
    output: AudioNode = ctx.destination,
  ) {
    // master -> glue compressor -> limiter -> trim -> output (keeps peaks under 0 dBFS)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    this.master = ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(comp);
    comp.connect(limiter);
    limiter.connect(trim);
    trim.connect(output);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    const r = rng(99);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.master);
  }

  private impulse(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    const r = rng(7);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  /**
   * Schedule the whole soundtrack so that video time `offset` plays now.
   * Returns the context time that maps to video t=0.
   */
  play(plan: StoryPlan, mix: Mix, offset = 0, voices?: VoiceBank, lead = 0.12): number {
    this.stop();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t0 = now + lead - offset;
    const session = ctx.createGain();
    session.connect(this.master);
    session.connect(this.reverb);
    this.session = session;

    const music = ctx.createGain();
    music.gain.value = mix.music;
    music.connect(session);
    const sfx = ctx.createGain();
    sfx.gain.value = mix.sfx;
    sfx.connect(session);
    // Narration stays mostly dry so it remains intelligible; a little room tone via a small send.
    const voice = ctx.createGain();
    voice.gain.value = mix.voice;
    voice.connect(this.master);
    const voiceSend = ctx.createGain();
    voiceSend.gain.value = 0.12;
    voice.connect(voiceSend);
    voiceSend.connect(this.reverb);

    const total = plan.scenes.reduce((a, s) => a + s.duration, 0);
    this.wind(music, Math.max(t0, now), t0 + total);

    let start = 0;
    plan.scenes.forEach((scene, i) => {
      const at = t0 + start;
      const end = at + scene.duration;
      if (end > now) {
        this.drone(music, scene.mood, at, end, i === plan.scenes.length - 1);
        if (scene.mood === "tension" || scene.mood === "terror") this.tensionStrings(music, at, end);
        this.sceneSfx(sfx, scene, i, at);
        const clip = scene.narration && voices?.get(scene.narration.url);
        if (clip) this.narrate(voice, music, mix.music, clip, at + NARRATION_LEAD, now);
      }
      start += scene.duration;
    });
    // final fade
    session.gain.setValueAtTime(1, T(Math.max(now, t0 + total - 0.8)));
    session.gain.linearRampToValueAtTime(0, T(t0 + total + 0.4));
    return t0;
  }

  private narrate(dest: AudioNode, music: GainNode, level: number, clip: AudioBuffer, at: number, now: number) {
    const end = at + clip.duration;
    if (end <= now) return;
    const src = this.ctx.createBufferSource();
    src.buffer = clip;
    // When previewing from the middle of a clip, start partway through it.
    if (at >= now) src.start(at);
    else src.start(now, now - at);
    src.connect(dest);
    this.sources.push(src);
    const g = music.gain;
    const from = Math.max(now, at - 0.15);
    g.setValueAtTime(level, T(from));
    g.linearRampToValueAtTime(level * DUCK, T(Math.max(from + 0.01, at + 0.1)));
    g.setValueAtTime(level * DUCK, T(end));
    g.linearRampToValueAtTime(level, T(end + 0.4));
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    if (this.session) {
      const s = this.session;
      const now = this.ctx.currentTime;
      s.gain.cancelScheduledValues(now);
      s.gain.setTargetAtTime(0, now, 0.05);
      setTimeout(() => s.disconnect(), 400);
      this.session = null;
    }
  }

  // ---------- building blocks ----------

  private osc(type: OscillatorType, freq: number, start: number, stop: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const s0 = Math.max(start, this.ctx.currentTime);
    o.start(s0);
    o.stop(Math.max(stop, s0));
    this.sources.push(o);
    return o;
  }

  private noiseSrc(start: number, stop: number): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.loopStart = Math.random();
    const s0 = Math.max(start, this.ctx.currentTime);
    n.start(s0, Math.random());
    n.stop(Math.max(stop, s0));
    this.sources.push(n);
    return n;
  }

  private env(start: number, attack: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(start));
    g.gain.exponentialRampToValueAtTime(peak, T(start + attack));
    g.gain.exponentialRampToValueAtTime(0.0001, T(start + attack + decay));
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private pan(value: number, dest: AudioNode): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = value;
    p.connect(dest);
    return p;
  }

  private wind(dest: AudioNode, start: number, stop: number) {
    const n = this.noiseSrc(start, stop + 0.5);
    const bp = this.filter("bandpass", 500, 0.8);
    const lfo = this.osc("sine", 0.09, start, stop + 0.5);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(bp.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, T(start));
    g.gain.linearRampToValueAtTime(0.07, T(start + 1.5));
    n.connect(bp).connect(g).connect(dest);
  }

  private drone(dest: AudioNode, mood: Mood, start: number, stop: number, last: boolean) {
    const f = ROOT[mood];
    const g = this.ctx.createGain();
    const fade = 0.35;
    g.gain.setValueAtTime(0, T(start));
    g.gain.linearRampToValueAtTime(0.16, T(start + fade));
    g.gain.setValueAtTime(0.16, T(stop - (last ? 0.05 : fade * 0.5)));
    g.gain.linearRampToValueAtTime(0, T(stop + (last ? 0.6 : fade * 0.5)));
    const lp = this.filter("lowpass", mood === "terror" ? 700 : 380, 4);
    const lfo = this.osc("sine", 0.13, start, stop + 1);
    const lg = this.ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(lp.frequency);
    lp.connect(g).connect(dest);
    const end = stop + 1;
    for (const [type, mult, det] of [
      ["sawtooth", 1, -9],
      ["sawtooth", 1, 8],
      ["sine", 0.5, 0],
      ["triangle", mood === "sad" ? 1.5 : 1.4983, 0], // minor-ish fifth, slightly flat = unsettling
    ] as [OscillatorType, number, number][]) {
      const o = this.osc(type, f * mult, start, end);
      o.detune.value = det;
      o.connect(lp);
    }
  }

  private tensionStrings(dest: AudioNode, start: number, stop: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, T(start));
    g.gain.linearRampToValueAtTime(0.025, T(stop - 0.1));
    g.gain.linearRampToValueAtTime(0, T(stop + 0.2));
    g.connect(dest);
    for (const f of [880, 932.3]) {
      const o = this.osc("sine", f, start, stop + 0.3);
      const vib = this.osc("sine", 5.5, start, stop + 0.3);
      const vg = this.ctx.createGain();
      vg.gain.value = 6;
      vib.connect(vg).connect(o.frequency);
      o.frequency.linearRampToValueAtTime(f * 1.06, T(stop));
      o.connect(g);
    }
  }

  // ---------- SFX ----------

  private sceneSfx(dest: AudioNode, scene: Scene, index: number, at: number) {
    const seed = sceneSeed(scene.id, scene.visual, index);
    const dur = scene.duration;
    const r = rng(seed + 400);
    const table: Record<Sfx, () => void> = {
      heartbeat: () => {
        const bpm = scene.mood === "terror" ? 120 : 78;
        for (let t = 0.1; t < dur - 0.2; t += 60 / bpm) {
          this.thump(dest, at + t, 0.9, 58);
          this.thump(dest, at + t + 0.22, 0.6, 52);
        }
      },
      creak: () => this.creak(dest, at + 0.2 + r() * dur * 0.3, Math.min(2, dur * 0.5)),
      whisper: () => {
        this.whisper(dest, at + 0.3, Math.min(2.2, dur * 0.6), -0.6);
        if (dur > 3) this.whisper(dest, at + dur * 0.55, Math.min(1.6, dur * 0.4), 0.6);
      },
      stinger: () => this.stinger(dest, at, scene.mood),
      thunder: () => strikeTimes(dur, seed).forEach((s) => this.thunder(dest, at + s + 0.15)),
      rain: () => this.rain(dest, at, at + dur),
      footsteps: () => {
        let i = 0;
        for (let t = 0.2; t < dur - 0.3; t += 0.52, i++) this.step(dest, at + t, 0.25 + Math.min(0.6, i * 0.06), i % 2 ? 0.3 : -0.3);
      },
      knock: () => {
        for (const base of [0.3, Math.min(dur - 1.2, 0.3 + dur * 0.5)]) {
          for (let k = 0; k < 3; k++) this.knock(dest, at + base + k * 0.28);
        }
      },
      musicbox: () => this.musicBox(dest, at, dur, ROOT[scene.mood] * 8, r),
      scream: () => this.scream(dest, at + Math.max(0.2, dur * 0.55)),
      glitch: () => {
        for (let k = 0; k < 5; k++) this.glitchBlip(dest, at + r() * dur, r);
      },
      buzz: () => {
        this.buzz(dest, at + 0.15);
        if (dur > 2.5) this.buzz(dest, at + dur * 0.5);
      },
      drip: () => {
        for (let t = 0.3; t < dur; t += 0.7 + r() * 0.6) this.drip(dest, at + t, r);
      },
      bell: () => {
        this.bell(dest, at + 0.1);
        if (dur > 3.5) this.bell(dest, at + dur * 0.5);
      },
    };
    for (const s of scene.sfx) table[s]?.();
  }

  private thump(dest: AudioNode, t: number, vol: number, f: number) {
    const o = this.osc("sine", f, t, t + 0.3);
    o.frequency.setValueAtTime(f * 1.6, T(t));
    o.frequency.exponentialRampToValueAtTime(f * 0.7, T(t + 0.15));
    o.connect(this.env(t, 0.008, vol, 0.2)).connect(dest);
  }

  private creak(dest: AudioNode, t: number, len: number) {
    const o = this.osc("sawtooth", 95, t, t + len + 0.1);
    const pts = 14;
    for (let i = 0; i <= pts; i++) o.frequency.setValueAtTime(70 + Math.random() * 90, T(t + (i / pts) * len));
    const bp = this.filter("bandpass", 900, 6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, T(t));
    g.gain.linearRampToValueAtTime(0.35, T(t + 0.1));
    g.gain.setValueAtTime(0.35, T(t + len - 0.15));
    g.gain.linearRampToValueAtTime(0, T(t + len));
    o.connect(bp).connect(g).connect(this.pan(0.4, dest));
  }

  private whisper(dest: AudioNode, t: number, len: number, panV: number) {
    const n = this.noiseSrc(t, t + len + 0.1);
    const bp = this.filter("bandpass", 2600, 3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, T(t));
    let x = t;
    while (x < t + len) {
      const syl = 0.08 + Math.random() * 0.16;
      g.gain.linearRampToValueAtTime(0.14 + Math.random() * 0.12, T(x + syl * 0.3));
      g.gain.linearRampToValueAtTime(0.01, T(x + syl));
      bp.frequency.setValueAtTime(1800 + Math.random() * 2400, T(x));
      x += syl + Math.random() * 0.06;
    }
    g.gain.linearRampToValueAtTime(0, T(t + len));
    n.connect(bp).connect(g).connect(this.pan(panV, dest));
  }

  private stinger(dest: AudioNode, t: number, mood: Mood) {
    const base = mood === "terror" ? 196 : 233;
    const g = this.env(t, 0.01, 0.22, 2.2);
    g.connect(dest);
    for (const m of [1, 1.059, 1.414, 1.5, 2.12]) {
      const o = this.osc("sawtooth", base * m, t, t + 2.4);
      o.frequency.exponentialRampToValueAtTime(base * m * 0.94, T(t + 2.2));
      o.connect(g);
    }
    // sub boom
    const b = this.osc("sine", 90, t, t + 1.5);
    b.frequency.exponentialRampToValueAtTime(28, T(t + 1.2));
    b.connect(this.env(t, 0.005, 0.9, 1.3)).connect(dest);
    // noise slam
    const n = this.noiseSrc(t, t + 0.6);
    n.connect(this.filter("lowpass", 2500)).connect(this.env(t, 0.004, 0.5, 0.45)).connect(dest);
  }

  private thunder(dest: AudioNode, t: number) {
    const n = this.noiseSrc(t, t + 4);
    const lp = this.filter("lowpass", 900);
    lp.frequency.setValueAtTime(1600, T(t));
    lp.frequency.exponentialRampToValueAtTime(120, T(t + 3.5));
    n.connect(lp).connect(this.env(t, 0.02, 0.8, 3.4)).connect(dest);
  }

  private rain(dest: AudioNode, start: number, stop: number) {
    const n = this.noiseSrc(start, stop + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, T(start));
    g.gain.linearRampToValueAtTime(0.09, T(start + 0.4));
    g.gain.setValueAtTime(0.09, T(stop - 0.2));
    g.gain.linearRampToValueAtTime(0, T(stop + 0.4));
    n.connect(this.filter("highpass", 900)).connect(this.filter("lowpass", 7000)).connect(g).connect(dest);
  }

  private step(dest: AudioNode, t: number, vol: number, panV: number) {
    const n = this.noiseSrc(t, t + 0.25);
    n.connect(this.filter("lowpass", 420)).connect(this.env(t, 0.005, vol, 0.16)).connect(this.pan(panV, dest));
    const o = this.osc("sine", 75, t, t + 0.2);
    o.connect(this.env(t, 0.004, vol * 0.7, 0.12)).connect(dest);
  }

  private knock(dest: AudioNode, t: number) {
    const o = this.osc("triangle", 170, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(90, T(t + 0.12));
    o.connect(this.env(t, 0.002, 0.9, 0.14)).connect(dest);
    const n = this.noiseSrc(t, t + 0.1);
    n.connect(this.filter("bandpass", 600, 2)).connect(this.env(t, 0.002, 0.5, 0.06)).connect(dest);
  }

  private musicBox(dest: AudioNode, start: number, dur: number, root: number, r: () => number) {
    let t = 0.1;
    let i = 0;
    while (t < dur - 0.2) {
      const note = semis(root, MINOR[Math.floor(r() * MINOR.length)]);
      const at = start + t;
      for (const [mult, vol] of [[1, 0.12], [3.01, 0.03], [5.98, 0.015]]) {
        const o = this.osc("sine", note * mult, at, at + 1.4);
        o.detune.value = (r() - 0.5) * 18;
        o.connect(this.env(at, 0.004, vol, 1.2)).connect(this.pan(0.25, dest));
      }
      t += 0.32 + i * 0.012; // slowly winding down
      i++;
    }
  }

  private scream(dest: AudioNode, t: number) {
    const len = 1.4;
    const o = this.osc("sawtooth", 600, t, t + len);
    o.frequency.setValueAtTime(500, T(t));
    o.frequency.linearRampToValueAtTime(1150, T(t + 0.25));
    o.frequency.linearRampToValueAtTime(900, T(t + 0.9));
    o.frequency.linearRampToValueAtTime(420, T(t + len));
    const trem = this.osc("sine", 9, t, t + len);
    const tg = this.ctx.createGain();
    tg.gain.value = 40;
    trem.connect(tg).connect(o.frequency);
    const n = this.noiseSrc(t, t + len);
    const out = this.env(t, 0.03, 0.3, len);
    const f1 = this.filter("bandpass", 950, 5);
    const f2 = this.filter("bandpass", 2600, 6);
    o.connect(f1).connect(out);
    o.connect(f2).connect(out);
    n.connect(f2);
    out.connect(this.pan(-0.2, dest));
  }

  private glitchBlip(dest: AudioNode, t: number, r: () => number) {
    const o = this.osc("square", 200 + r() * 2400, t, t + 0.12);
    o.connect(this.env(t, 0.002, 0.08, 0.08)).connect(this.pan(r() * 2 - 1, dest));
  }

  private buzz(dest: AudioNode, t: number) {
    for (const s of [0, 0.55]) {
      const o = this.osc("square", 155, t + s, t + s + 0.4);
      o.connect(this.filter("lowpass", 600)).connect(this.env(t + s, 0.01, 0.18, 0.38)).connect(dest);
    }
  }

  private drip(dest: AudioNode, t: number, r: () => number) {
    const o = this.osc("sine", 1400, t, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(380 + r() * 200, T(t + 0.06));
    o.connect(this.env(t, 0.002, 0.25, 0.08)).connect(this.pan(r() - 0.5, dest));
  }

  private bell(dest: AudioNode, t: number) {
    for (const [m, v] of [[1, 0.25], [2.0, 0.12], [2.76, 0.1], [5.4, 0.05], [0.5, 0.15]]) {
      const o = this.osc("sine", 110 * m, t, t + 5);
      o.connect(this.env(t, 0.005, v, 4.5)).connect(dest);
    }
  }
}
