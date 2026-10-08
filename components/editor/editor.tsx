"use client";
import { AlertTriangle, Check, Clapperboard, CloudOff, Download, Ghost, Loader2, Mic, Play, Plus, Sparkles, Square, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Arrow, fmtTime, Gauge, Segmented, Switch, timeAgo } from "@/components/ui";
import { api } from "@/lib/client/api";
import { PreviewPlayer, Thumbnailer } from "@/lib/client/preview";
import { sceneAt } from "@/lib/engine/renderer";
import { SAMPLES } from "@/lib/engine/samples";
import {
  fitDurations,
  MAX_DURATION,
  MIN_DURATION,
  totalDuration,
  type CaptionStyle,
  type ProjectSettings,
  type Scene,
  type StoryPlan,
} from "@/lib/engine/types";
import type { Capabilities } from "@/lib/server/capabilities";
import type { Project, RenderJob } from "@/lib/server/projects";
import { SceneRow } from "./scene-row";

type SaveState = "saved" | "saving" | "unsaved" | "error";
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function Editor({ initial, caps, initialRenders }: { initial: Project; caps: Capabilities; initialRenders: RenderJob[] }) {
  const toast = useToast();
  const [project, setProject] = useState(initial);
  const [renders, setRenders] = useState(initialRenders);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [time, setTime] = useState(1.2);
  const [playing, setPlaying] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [imageBusy, setImageBusy] = useState<Set<string>>(new Set());
  const [bulkImages, setBulkImages] = useState(false);
  const [view, setView] = useState<"preview" | "video">("preview");
  const [useAi, setUseAi] = useState(caps.ai);
  const [thumbs, setThumbs] = useState<Thumbnailer | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const dirty = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  const { plan, settings } = project;
  const total = plan ? totalDuration(plan) : project.duration;
  const valid = !!plan && total >= MIN_DURATION - 0.05 && total <= MAX_DURATION + 0.05;
  const voiceId = settings.voiceId || caps.tts.voices[0]?.id || "";
  const narrated = plan?.scenes.filter((s) => s.narration).length ?? 0;
  const isStale = useCallback((s: Scene) => !!s.narration && (s.narration.text !== s.text.trim() || s.narration.voice !== voiceId), [voiceId]);
  const needVoice = plan?.scenes.filter((s) => s.text.trim() && (!s.narration || isStale(s))).length ?? 0;
  const active = renders.find((r) => r.status === "queued" || r.status === "rendering");
  const latestDone = renders.find((r) => r.status === "done");
  const busy = planning || narrating;
  const opts = useMemo(() => ({ captionStyle: settings.captionStyle, showTitle: settings.showTitle }), [settings.captionStyle, settings.showTitle]);
  const mix = { music: settings.music, sfx: settings.sfx, voice: settings.voice };

  // ---------- persistence ----------
  const update = (patch: Partial<Project> | ((p: Project) => Partial<Project>)) => {
    dirty.current = true;
    setProject((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  };
  const updateSettings = (patch: Partial<ProjectSettings>) => update((p) => ({ settings: { ...p.settings, ...patch } }));
  const updatePlan = (fn: (plan: StoryPlan) => StoryPlan) => update((p) => (p.plan ? { plan: fn(p.plan) } : {}));
  const updateScene = (id: string, patch: Partial<Scene>) =>
    updatePlan((pl) => ({ ...pl, scenes: pl.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const p = projectRef.current;
    setSaveState("saving");
    try {
      await api(`/api/projects/${p.id}`, {
        method: "PATCH",
        json: { title: p.title, story: p.story, duration: p.duration, settings: p.settings, plan: p.plan },
      });
      setSaveState(dirty.current ? "unsaved" : "saved");
    } catch (e) {
      dirty.current = true;
      setSaveState("error");
      toast(`Couldn't save: ${(e as Error).message}`, true);
    }
  }, [toast]);

  useEffect(() => {
    if (!dirty.current) return;
    setSaveState("unsaved");
    const t = setTimeout(save, 700);
    return () => clearTimeout(t);
  }, [project, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** Replace local state with the server's copy (after AI operations). */
  const applyServer = (p: Project) => {
    dirty.current = false;
    setProject(p);
    setSaveState("saved");
  };

  // ---------- preview ----------
  useEffect(() => {
    playerRef.current = new PreviewPlayer(canvasRef.current!, setTime, () => setPlaying(false));
    setThumbs(new Thumbnailer());
    return () => playerRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!plan || playerRef.current?.playing) return;
    let alive = true;
    document.fonts.ready.then(() => alive && playerRef.current?.draw(plan, Math.min(time, totalDuration(plan)), opts));
    return () => {
      alive = false;
    };
  }, [plan, time, opts]);

  const stop = () => {
    playerRef.current?.stop();
    setPlaying(false);
  };
  const togglePlay = async () => {
    if (!plan) return;
    if (playing) return stop();
    setView("preview");
    setPlaying(true);
    try {
      await playerRef.current!.play(plan, opts, mix, time >= total - 0.1 ? 0 : time);
    } catch (e) {
      setPlaying(false);
      toast((e as Error).message, true);
    }
  };
  const seek = (t: number) => {
    stop();
    setView("preview");
    setTime(Math.max(0, Math.min(t, total)));
  };
  const seekScene = (i: number) => {
    if (!plan) return;
    const start = plan.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0);
    seek(start + Math.min(1.2, plan.scenes[i].duration * 0.5));
  };
  const currentIdx = plan ? (sceneAt(plan, time)?.index ?? -1) : -1;

  // ---------- AI actions ----------
  const generate = async () => {
    if (words(project.story) < 5) return toast("Write at least a sentence or two first.", true);
    if (plan && (narrated || plan.scenes.some((s) => s.image)) && !confirm("Regenerating replaces your scenes, narration and images. Continue?")) return;
    stop();
    setPlanning(true);
    try {
      await save();
      const r = await api<{ project: Project; source: string }>(`/api/projects/${project.id}/plan`, {
        method: "POST",
        json: { story: project.story, duration: project.duration, title: project.title, useAi },
      });
      applyServer(r.project);
      setTime(1.2);
      toast(r.source === "ai" ? `Claude directed ${r.project.plan!.scenes.length} scenes.` : `Planned ${r.project.plan!.scenes.length} scenes.`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setPlanning(false);
    }
  };

  const narrate = async (force = false) => {
    if (!plan) return;
    stop();
    setNarrating(true);
    try {
      await save();
      const r = await api<{ project: Project; generated: number }>(`/api/projects/${project.id}/narration`, { method: "POST", json: { voice: voiceId, force } });
      applyServer(r.project);
      const t = totalDuration(r.project.plan!);
      toast(
        t > MAX_DURATION
          ? `Narration is ${t.toFixed(0)}s, over the 60s limit. Trim some captions and regenerate.`
          : `Narrated ${r.generated} scene${r.generated === 1 ? "" : "s"}. Timing now follows the voice.`,
        t > MAX_DURATION,
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setNarrating(false);
    }
  };

  const removeNarration = async () => {
    if (!confirm("Remove narration from all scenes?")) return;
    await save();
    try {
      applyServer((await api<{ project: Project }>(`/api/projects/${project.id}/narration`, { method: "DELETE" })).project);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  /** Only merge image fields from the server so concurrent local edits survive. */
  const mergeImage = (sceneId: string, server: Project) => {
    const s = server.plan?.scenes.find((x) => x.id === sceneId);
    setProject((p) =>
      p.plan
        ? { ...p, plan: { ...p.plan, scenes: p.plan.scenes.map((x) => (x.id === sceneId ? { ...x, image: s?.image, imagePrompt: s?.imagePrompt ?? x.imagePrompt } : x)) } }
        : p,
    );
  };

  const sceneImage = async (scene: Scene, action: "ai" | "upload" | "remove", file?: File) => {
    setImageBusy((b) => new Set(b).add(scene.id));
    try {
      await save();
      const url = `/api/projects/${project.id}/scenes/${scene.id}/image`;
      let r: { project: Project };
      if (action === "remove") r = await api(url, { method: "DELETE" });
      else if (action === "upload") {
        const fd = new FormData();
        fd.append("file", file!);
        r = await api(url, { method: "POST", body: fd });
      } else r = await api(url, { method: "POST", json: { prompt: scene.imagePrompt || scene.text } });
      mergeImage(scene.id, r.project);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setImageBusy((b) => {
        const n = new Set(b);
        n.delete(scene.id);
        return n;
      });
    }
  };

  const generateAllImages = async () => {
    if (!plan) return;
    const todo = plan.scenes.filter((s) => !s.image);
    if (!todo.length) return toast("Every scene already has an image.");
    setBulkImages(true);
    const queue = [...todo];
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (let s = queue.shift(); s; s = queue.shift()) await sceneImage(s, "ai");
      }),
    );
    setBulkImages(false);
    toast("Scene images ready.");
  };

  // ---------- render ----------
  const render = async () => {
    if (!plan || !valid) return;
    stop();
    try {
      await save();
      const { render: r } = await api<{ render: RenderJob }>(`/api/projects/${project.id}/renders`, { method: "POST" });
      setRenders((rs) => [r, ...rs]);
      toast("Render started. You can keep editing; it renders on the server.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        const { renders: rs } = await api<{ renders: RenderJob[] }>(`/api/projects/${project.id}/renders`);
        const was = active;
        setRenders(rs);
        const now = rs.find((r) => r.id === was.id);
        if (now?.status === "done") {
          toast("Your video is ready!");
          setView("video");
        } else if (now?.status === "failed") toast(`Render failed: ${now.error ?? "unknown error"}`, true);
      } catch {
        /* transient */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [active, project.id, toast]);

  // ---------- derived UI ----------
  const sfxCount = plan?.scenes.reduce((a, s) => a + s.sfx.length, 0) ?? 0;
  const narratedTiming = narrated > 0;
  const pace = plan ? plan.scenes.reduce((a, s) => a + words(s.text), 0) / total : words(project.story) / project.duration;
  const gaugeValue = active ? active.progress : latestDone ? 1 : 0;
  const gaugeSub = active ? (active.status === "queued" ? "Queued" : "Rendering on server…") : latestDone ? `Rendered ${timeAgo(latestDone.createdAt)}` : "Not rendered";
  const slug = (project.title || "horror-short").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const SaveBadge = {
    saved: <span className="chip"><Check size={13} className="text-ok" /> Saved</span>,
    saving: <span className="chip"><Loader2 size={13} className="animate-spin" /> Saving</span>,
    unsaved: <span className="chip">Unsaved changes</span>,
    error: <span className="chip !text-accent-text"><CloudOff size={13} /> Not saved</span>,
  }[saveState];

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-bento bg-card px-6 py-[22px]">
        <div className="min-w-0 flex-1">
          <input
            value={project.title}
            onChange={(e) => update({ title: e.target.value.slice(0, 80) })}
            aria-label="Story title"
            className="w-full min-w-0 bg-transparent text-[34px] font-bold tracking-[-0.03em] outline-none max-[560px]:text-[26px]"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            {SaveBadge}
            <span className="text-sm">Write a story, generate scenes, add a voice, then render your MP4.</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 max-[560px]:w-full">
          <button
            type="button"
            className="btn btn-outline max-[560px]:flex-1"
            onClick={() => {
              const s = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
              update({ story: s.story, title: project.title === "Untitled story" ? s.title : project.title });
            }}
          >
            Try a sample
          </button>
          <button type="button" className="btn btn-primary max-[560px]:flex-1" onClick={generate} disabled={busy}>
            {planning ? <span className="spinner" /> : <Wand2 size={18} />} {plan ? "Regenerate scenes" : "Generate scenes"}
          </button>
        </div>
      </section>

      <section className="editor-grid">
        {/* ---- stats ---- */}
        <article className="card hero-grad text-white" style={{ gridArea: "dur" }}>
          <div className="flex items-center justify-between">
            <h2 className="card-title">Video length</h2>
            <Arrow className="border-white bg-white !text-[#111]" />
          </div>
          <div className="text-[52px] font-semibold leading-none tracking-[-0.04em]">
            {plan ? total.toFixed(0) : project.duration}
            <small className="ml-1.5 text-base opacity-70">sec</small>
          </div>
          <input
            type="range"
            min={MIN_DURATION}
            max={MAX_DURATION}
            value={project.duration}
            disabled={narratedTiming || busy}
            aria-label="Target length in seconds"
            className="accent-white disabled:opacity-40"
            onChange={(e) => {
              const d = Number(e.target.value);
              update((p) => ({ duration: d, plan: p.plan ? { ...p.plan, scenes: fitDurations(p.plan.scenes, d) } : p.plan }));
            }}
          />
          <p className="mt-auto text-[12.5px] text-[#ffd5db]">
            {narratedTiming ? "Timing follows the narration" : !valid && plan ? `Must be ${MIN_DURATION}–${MAX_DURATION}s to render` : "10–60s · Shorts, Reels & TikTok"}
          </p>
        </article>
        <Stat area="scn" title="Scenes" value={plan?.scenes.length ?? 0} foot={plan ? `${(total / plan.scenes.length).toFixed(1)}s per scene · ${sfxCount} sound cues` : "Generate to plan scenes"} />
        <Stat
          area="voc"
          title="Narration"
          value={`${narrated}/${plan?.scenes.length ?? 0}`}
          foot={!caps.tts.provider ? "Voice not configured on server" : needVoice ? `${needVoice} scene${needVoice === 1 ? "" : "s"} need a voice` : narrated ? "All scenes narrated" : "No narration yet"}
          accent={!!needVoice && !!caps.tts.provider && !!plan}
        />
        <Stat
          area="pace"
          title="Reading pace"
          value={pace ? pace.toFixed(1) : "0"}
          suffix="w/s"
          foot={pace > 3.4 ? "Too fast: trim captions" : pace ? "Comfortable to read" : "Words per second"}
          accent={pace > 3.4}
        />

        {/* ---- story ---- */}
        <article className="card" style={{ gridArea: "story" }}>
          <div className="flex items-center justify-between">
            <h2 className="card-title">Your story</h2>
            <span className="text-[12.5px] text-muted">{project.story.length} / 6000</span>
          </div>
          <textarea
            className="field min-h-[210px] flex-1 resize-y leading-relaxed"
            maxLength={6000}
            value={project.story}
            disabled={busy}
            onChange={(e) => update({ story: e.target.value })}
            placeholder="It started with a knock at 3 AM. Nobody knocks at 3 AM…"
          />
          <div className="flex flex-wrap items-center gap-3.5">
            <Segmented<CaptionStyle>
              label="Caption style"
              value={settings.captionStyle}
              onChange={(v) => updateSettings({ captionStyle: v })}
              options={[
                { value: "bold", label: "Bold" },
                { value: "typewriter", label: "Typewriter" },
                { value: "creepy", label: "Creepy" },
              ]}
            />
            <Switch label="Title card" checked={settings.showTitle} onChange={(v) => updateSettings({ showTitle: v })} />
            <Switch label="AI director" checked={useAi && caps.ai} disabled={!caps.ai} onChange={setUseAi} />
          </div>
        </article>

        {/* ---- player ---- */}
        <article className="card night-grad items-stretch text-white" style={{ gridArea: "player" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-full bg-white/10 p-1 text-[12.5px] font-semibold">
              <button type="button" onClick={() => setView("preview")} className={`rounded-full px-3 py-1 ${view === "preview" ? "bg-white text-[#111]" : "text-[#c9cad1]"}`}>
                Live preview
              </button>
              <button type="button" disabled={!latestDone} onClick={() => (stop(), setView("video"))} className={`rounded-full px-3 py-1 disabled:opacity-40 ${view === "video" ? "bg-white text-[#111]" : "text-[#c9cad1]"}`}>
                Final MP4
              </button>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${playing ? "bg-[#e0263f] text-white" : active ? "bg-[#b46a00] text-white" : "bg-white/10 text-[#c9cad1]"}`}>
              {playing ? "Playing" : active ? `Rendering ${Math.round(active.progress * 100)}%` : "Ready"}
            </span>
          </div>
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[18px] bg-black shadow-[0_0_0_1px_#ffffff14,0_20px_40px_-20px_#000]">
            <canvas ref={canvasRef} width={540} height={960} className={`block size-full ${view === "video" ? "hidden" : ""}`} />
            {view === "video" && latestDone?.file && (
              <video key={latestDone.id} src={latestDone.file} poster={latestDone.file.replace(/\.mp4$/, ".jpg")} controls autoPlay playsInline className="size-full bg-black object-contain" />
            )}
            {!plan && view === "preview" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] text-[#6f707a]" style={{ background: "repeating-linear-gradient(45deg,#ffffff06 0 6px,transparent 6px 14px)" }}>
                <Ghost size={40} />
                <p>Your short appears here</p>
              </div>
            )}
          </div>
          {view === "preview" && (
            <>
              <input
                type="range"
                min={0}
                max={1000}
                aria-label="Seek"
                className="accent-[#e0263f]"
                value={Math.round((time / Math.max(total, 0.01)) * 1000)}
                disabled={!plan}
                onChange={(e) => seek((Number(e.target.value) / 1000) * total)}
              />
              <div className="text-center text-[38px] font-semibold leading-none tabular-nums">
                {fmtTime(time)}
                <span className="ml-2 text-[15px] font-medium text-[#8c8d96]">/ {fmtTime(total)}</span>
              </div>
              <div className="flex justify-center gap-3.5">
                <button type="button" onClick={togglePlay} disabled={!plan} aria-label={playing ? "Stop" : "Play"} className="inline-flex size-[54px] items-center justify-center rounded-full bg-white text-[#111] transition active:scale-95 disabled:opacity-35">
                  {playing ? <Square size={20} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
                </button>
                <button type="button" onClick={render} disabled={!valid || !!active || busy} aria-label="Render MP4" title="Render MP4 on the server" className="inline-flex size-[54px] items-center justify-center rounded-full bg-[#e0263f] text-white transition active:scale-95 disabled:opacity-35">
                  {active ? <Loader2 size={22} className="animate-spin" /> : <Clapperboard size={22} />}
                </button>
              </div>
              <p className="text-center text-xs text-[#8c8d96]">Preview plays in your browser. The final MP4 renders on the server.</p>
            </>
          )}
        </article>

        {/* ---- timeline ---- */}
        <article className="card" style={{ gridArea: "timeline" }}>
          <div className="flex items-center justify-between">
            <h2 className="card-title">Scene timeline</h2>
            <span className="text-[12.5px] text-muted">{plan ? `${total.toFixed(1)}s total` : "0.0s"}</span>
          </div>
          <div className="flex min-h-[170px] items-end gap-2 overflow-x-auto pt-6">
            {!plan ? (
              <p className="m-auto text-[13.5px] text-muted">Scenes will appear here once generated.</p>
            ) : (
              plan.scenes.map((s, i) => {
                const max = Math.max(...plan.scenes.map((x) => x.duration));
                const kind = s.mood === "terror" ? "accent-grad" : s.mood === "tension" ? "bg-[color-mix(in_srgb,var(--accent)_45%,var(--card))]" : "hatched";
                return (
                  <button key={s.id} type="button" onClick={() => seekScene(i)} title={`${s.visual} · ${s.mood}`} className="group flex flex-[1_0_34px] flex-col items-center gap-2">
                    <div
                      className={`relative w-full max-w-[54px] rounded-full ${kind} ${i === currentIdx ? "outline-[3px] outline-offset-2 outline-accent/35" : ""}`}
                      style={{ height: 30 + (s.duration / max) * 110, outlineStyle: i === currentIdx ? "solid" : undefined }}
                    >
                      {s.narration && <Mic size={12} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white mix-blend-difference" />}
                      <em className={`absolute -top-[26px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-card px-1.5 text-[10.5px] font-bold not-italic text-fg transition ${i === currentIdx ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        {s.duration.toFixed(1)}s
                      </em>
                    </div>
                    <b className="text-[11.5px] font-semibold text-muted">S{i + 1}</b>
                  </button>
                );
              })
            )}
          </div>
        </article>

        {/* ---- voice & mix ---- */}
        <article className="card" style={{ gridArea: "mix" }}>
          <div className="flex items-center justify-between">
            <h2 className="card-title">Voice &amp; sound</h2>
            <span className="arrow-btn"><Mic size={15} /></span>
          </div>
          {caps.tts.provider ? (
            <>
              <select className="field py-2.5" aria-label="Narrator voice" value={voiceId} onChange={(e) => updateSettings({ voiceId: e.target.value })} disabled={narrating}>
                {caps.tts.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.description ? ` — ${v.description}` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm py-2.5" disabled={!plan || narrating || planning || (!needVoice && narrated > 0)} onClick={() => narrate(false)}>
                {narrating ? <span className="spinner" /> : <Mic size={15} />}
                {narrating ? "Recording narration…" : narrated && !needVoice ? "Narration up to date" : needVoice && narrated ? `Update narration (${needVoice})` : "Generate narration"}
              </button>
              {narrated > 0 && (
                <button type="button" onClick={removeNarration} className="-mt-1 text-xs font-semibold text-muted hover:text-accent-text">
                  Remove narration
                </button>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-card-2 px-3 py-2.5 text-[12.5px] text-muted">
              Narration needs <code>OPENAI_API_KEY</code> or <code>ELEVENLABS_API_KEY</code> on the server.
            </p>
          )}
          <Slider label="Voice" value={settings.voice} onChange={(v) => updateSettings({ voice: v })} />
          <Slider label="Score" value={settings.music} onChange={(v) => updateSettings({ music: v })} />
          <Slider label="Effects" value={settings.sfx} onChange={(v) => updateSettings({ sfx: v })} />
        </article>

        {/* ---- scenes ---- */}
        <article className="card max-h-[760px]" style={{ gridArea: "scenes" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title">Scenes</h2>
            <div className="flex gap-2">
              {caps.images && plan && (
                <button type="button" className="btn btn-outline btn-sm" onClick={generateAllImages} disabled={bulkImages || busy}>
                  {bulkImages ? <span className="spinner spinner-dark" /> : <Sparkles size={14} />} AI images for all
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!plan || plan.scenes.length >= 30 || busy}
                onClick={() =>
                  updatePlan((pl) => ({
                    ...pl,
                    scenes: [
                      ...pl.scenes,
                      { id: `s${Date.now().toString(36)}`, text: "And then it was right behind me.", visual: "figure", mood: "terror", duration: 3, effects: ["zoom", "shake"], sfx: ["stinger"] },
                    ],
                  }))
                }
              >
                <Plus size={14} /> Add scene
              </button>
            </div>
          </div>
          <div className="-mx-1.5 flex flex-col gap-1 overflow-y-auto px-1.5">
            {!plan ? (
              <p className="m-auto py-5 text-center text-[13.5px] text-muted">
                Write a story and press <b className="text-fg">Generate scenes</b>.
              </p>
            ) : (
              plan.scenes.map((s, i) => (
                <SceneRow
                  key={s.id}
                  plan={plan}
                  index={i}
                  current={i === currentIdx}
                  thumbs={thumbs}
                  disabled={busy}
                  canGenerateImage={caps.images}
                  imageBusy={imageBusy.has(s.id)}
                  narrationStale={isStale(s)}
                  onChange={(patch) => updateScene(s.id, patch)}
                  onDelete={() => {
                    if (plan.scenes.length <= 1) return toast("A short needs at least one scene.", true);
                    updatePlan((pl) => ({ ...pl, scenes: pl.scenes.filter((x) => x.id !== s.id) }));
                  }}
                  onSeek={() => seekScene(i)}
                  onGenerateImage={() => sceneImage(s, "ai")}
                  onUploadImage={(f) => sceneImage(s, "upload", f)}
                  onRemoveImage={() => sceneImage(s, "remove")}
                  onPlayVoice={() => s.narration && new Audio(s.narration.url).play()}
                />
              ))
            )}
          </div>
        </article>

        {/* ---- export ---- */}
        <article className="card" style={{ gridArea: "export" }}>
          <div className="flex items-center justify-between">
            <h2 className="card-title">Export</h2>
            <span className="arrow-btn"><Download size={15} /></span>
          </div>
          <Gauge value={gaugeValue} label={`${Math.round(gaugeValue * 100)}%`} sub={gaugeSub} />
          <div className="flex justify-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-accent" /> Rendered</span>
            <span className="inline-flex items-center gap-1.5"><i className="hatched size-2.5 rounded-full !border" /> Remaining</span>
          </div>
          <Segmented
            label="Quality"
            value={String(settings.quality) as "720" | "1080"}
            onChange={(v) => updateSettings({ quality: Number(v) as 720 | 1080 })}
            options={[
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p · faster" },
            ]}
          />
          {plan && !valid && (
            <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-text">
              <AlertTriangle size={14} className="mt-px shrink-0" /> Total is {total.toFixed(1)}s. Keep it between {MIN_DURATION} and {MAX_DURATION}s to render.
            </p>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <button type="button" className="btn btn-primary w-full" onClick={render} disabled={!valid || !!active || busy}>
              {active ? <span className="spinner" /> : <Clapperboard size={17} />}
              {active ? (active.status === "queued" ? "Queued…" : "Rendering…") : latestDone ? "Render again" : "Render MP4"}
            </button>
            {latestDone?.file && (
              <a className="btn btn-outline w-full" href={`${latestDone.file}?download=${slug}.mp4`}>
                <Download size={16} /> Download · {((latestDone.size ?? 0) / 1e6).toFixed(1)} MB
              </a>
            )}
          </div>
          {renders.some((r) => r.status === "failed") && renders[0]?.status === "failed" && (
            <p className="text-xs text-accent-text">Last render failed: {renders[0].error}</p>
          )}
        </article>
      </section>
    </>
  );
}

function Stat({ area, title, value, foot, suffix, accent }: { area: string; title: string; value: React.ReactNode; foot: string; suffix?: string; accent?: boolean }) {
  return (
    <article className="card" style={{ gridArea: area }}>
      <div className="flex items-center justify-between">
        <h2 className="card-title">{title}</h2>
        <Arrow />
      </div>
      <div className="text-[52px] font-semibold leading-none tracking-[-0.04em] max-[560px]:text-[40px]">
        {value}
        {suffix && <small className="ml-1.5 text-base font-semibold tracking-normal opacity-60">{suffix}</small>}
      </div>
      <p className={`mt-auto text-[12.5px] ${accent ? "font-semibold text-accent-text" : "text-muted"}`}>{foot}</p>
    </article>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label className="grid grid-cols-[58px_1fr_42px] items-center gap-2.5 text-[13px] font-semibold">
      {label}
      <input type="range" min={0} max={150} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <output className="text-right text-xs tabular-nums text-muted">{Math.round(value * 100)}%</output>
    </label>
  );
}
