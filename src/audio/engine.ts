// Procedural horror sound design with the Web Audio API: a mood-driven drone
// score, wind, reverb, and synthesized SFX scheduled per scene. Everything is
// routed to the speakers (preview) and to a MediaStream (recording).
import type { Mood, Scene, Sfx, StoryPlan } from "../../shared/types";
import { rng, sceneSeed, strikeTimes } from "../render/util";

const ROOT: Record<Mood, number> = { dread: 55, tension: 49, terror: 46.25, eerie: 61.74, sad: 41.2 };
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];
const semis = (f: number, s: number) => f * Math.pow(2, s / 12);

export interface Mix {
  music: number;
  sfx: number;
}

export class SoundEngine {
  readonly ctx: AudioContext;
  readonly stream: MediaStream;
  private master: GainNode;
  private reverb: ConvolverNode;
  private noise: AudioBuffer;
  private session: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    // master -> glue compressor -> brickwall-ish limiter -> output (keeps peaks under 0 dBFS)
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const trim = this.ctx.createGain();
    trim.gain.value = 0.8;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(comp).connect(limiter).connect(trim);
    trim.connect(this.ctx.destination);
    const out = this.ctx.createMediaStreamDestination();
    trim.connect(out);
    this.stream = out.stream;

    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.master);
  }

  private impulse(seconds: number): AudioBuffer {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  /** Schedule the whole soundtrack. Returns the AudioContext time that maps to video t=0. */
  play(plan: StoryPlan, mix: Mix, offset = 0): number {
    this.stop();
    const t0 = this.ctx.currentTime + 0.12 - offset;
    const session = this.ctx.createGain();
    session.connect(this.master);
    session.connect(this.reverb);
    this.session = session;

    const music = this.ctx.createGain();
    music.gain.value = mix.music;
    music.connect(session);
    const sfx = this.ctx.createGain();
    sfx.gain.value = mix.sfx;
    sfx.connect(session);

    const total = plan.scenes.reduce((a, s) => a + s.duration, 0);
    this.wind(music, Math.max(t0, this.ctx.currentTime), t0 + total);

    let start = 0;
    plan.scenes.forEach((scene, i) => {
      const at = t0 + start;
      const end = at + scene.duration;
      if (end > this.ctx.currentTime) {
        this.drone(music, scene.mood, at, end, i === plan.scenes.length - 1);
        if (scene.mood === "tension" || scene.mood === "terror") this.tensionStrings(music, at, end);
        this.sceneSfx(sfx, scene, i, at);
      }
      start += scene.duration;
    });
    // final hit + fade
    session.gain.setValueAtTime(1, t0 + total - 0.8);
    session.gain.linearRampToValueAtTime(0, t0 + total + 0.4);
    return t0;
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
      s.gain.cancelScheduledValues(this.ctx.currentTime);
      s.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => s.disconnect(), 400);
      this.session = null;
    }
  }

  // ---------- building blocks ----------

  private osc(type: OscillatorType, freq: number, start: number, stop: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(Math.max(start, this.ctx.currentTime));
    o.stop(stop);
    this.sources.push(o);
    return o;
  }

  private noiseSrc(start: number, stop: number): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.loopStart = Math.random();
    n.start(Math.max(start, this.ctx.currentTime), Math.random());
    n.stop(stop);
    this.sources.push(n);
    return n;
  }

  private env(start: number, attack: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
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
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.07, start + 1.5);
    n.connect(bp).connect(g).connect(dest);
  }

  private drone(dest: AudioNode, mood: Mood, start: number, stop: number, last: boolean) {
    const f = ROOT[mood];
    const g = this.ctx.createGain();
    const fade = 0.35;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.16, start + fade);
    g.gain.setValueAtTime(0.16, stop - (last ? 0.05 : fade * 0.5));
    g.gain.linearRampToValueAtTime(0, stop + (last ? 0.6 : fade * 0.5));
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
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.025, stop - 0.1);
    g.gain.linearRampToValueAtTime(0, stop + 0.2);
    g.connect(dest);
    for (const f of [880, 932.3]) {
      const o = this.osc("sine", f, start, stop + 0.3);
      const vib = this.osc("sine", 5.5, start, stop + 0.3);
      const vg = this.ctx.createGain();
      vg.gain.value = 6;
      vib.connect(vg).connect(o.frequency);
      o.frequency.linearRampToValueAtTime(f * 1.06, stop);
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
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.15);
    o.connect(this.env(t, 0.008, vol, 0.2)).connect(dest);
  }

  private creak(dest: AudioNode, t: number, len: number) {
    const o = this.osc("sawtooth", 95, t, t + len + 0.1);
    const pts = 14;
    for (let i = 0; i <= pts; i++) o.frequency.setValueAtTime(70 + Math.random() * 90, t + (i / pts) * len);
    const bp = this.filter("bandpass", 900, 6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.1);
    g.gain.setValueAtTime(0.35, t + len - 0.15);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(bp).connect(g).connect(this.pan(0.4, dest));
  }

  private whisper(dest: AudioNode, t: number, len: number, panV: number) {
    const n = this.noiseSrc(t, t + len + 0.1);
    const bp = this.filter("bandpass", 2600, 3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    let x = t;
    while (x < t + len) {
      const syl = 0.08 + Math.random() * 0.16;
      g.gain.linearRampToValueAtTime(0.14 + Math.random() * 0.12, x + syl * 0.3);
      g.gain.linearRampToValueAtTime(0.01, x + syl);
      bp.frequency.setValueAtTime(1800 + Math.random() * 2400, x);
      x += syl + Math.random() * 0.06;
    }
    g.gain.linearRampToValueAtTime(0, t + len);
    n.connect(bp).connect(g).connect(this.pan(panV, dest));
  }

  private stinger(dest: AudioNode, t: number, mood: Mood) {
    const base = mood === "terror" ? 196 : 233;
    const g = this.env(t, 0.01, 0.22, 2.2);
    g.connect(dest);
    for (const m of [1, 1.059, 1.414, 1.5, 2.12]) {
      const o = this.osc("sawtooth", base * m, t, t + 2.4);
      o.frequency.exponentialRampToValueAtTime(base * m * 0.94, t + 2.2);
      o.connect(g);
    }
    // sub boom
    const b = this.osc("sine", 90, t, t + 1.5);
    b.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    b.connect(this.env(t, 0.005, 0.9, 1.3)).connect(dest);
    // noise slam
    const n = this.noiseSrc(t, t + 0.6);
    n.connect(this.filter("lowpass", 2500)).connect(this.env(t, 0.004, 0.5, 0.45)).connect(dest);
  }

  private thunder(dest: AudioNode, t: number) {
    const n = this.noiseSrc(t, t + 4);
    const lp = this.filter("lowpass", 900);
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 3.5);
    n.connect(lp).connect(this.env(t, 0.02, 0.8, 3.4)).connect(dest);
  }

  private rain(dest: AudioNode, start: number, stop: number) {
    const n = this.noiseSrc(start, stop + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.09, start + 0.4);
    g.gain.setValueAtTime(0.09, stop - 0.2);
    g.gain.linearRampToValueAtTime(0, stop + 0.4);
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
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
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
    o.frequency.setValueAtTime(500, t);
    o.frequency.linearRampToValueAtTime(1150, t + 0.25);
    o.frequency.linearRampToValueAtTime(900, t + 0.9);
    o.frequency.linearRampToValueAtTime(420, t + len);
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
    o.frequency.exponentialRampToValueAtTime(380 + r() * 200, t + 0.06);
    o.connect(this.env(t, 0.002, 0.25, 0.08)).connect(this.pan(r() - 0.5, dest));
  }

  private bell(dest: AudioNode, t: number) {
    for (const [m, v] of [[1, 0.25], [2.0, 0.12], [2.76, 0.1], [5.4, 0.05], [0.5, 0.15]]) {
      const o = this.osc("sine", 110 * m, t, t + 5);
      o.connect(this.env(t, 0.005, v, 4.5)).connect(dest);
    }
  }
}
