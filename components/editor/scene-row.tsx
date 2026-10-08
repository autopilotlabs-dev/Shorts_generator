"use client";
import { ImagePlus, Mic, Play, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Thumbnailer } from "@/lib/client/preview";
import { EFFECTS, MOODS, SFX, VISUALS, type Scene, type StoryPlan } from "@/lib/engine/types";

const MOOD_CLS: Record<string, string> = {
  terror: "text-[#d4213a] border-[#f0a3ad] bg-[#fdecee]",
  tension: "text-[#b46a00] border-[#f2cf96] bg-[#fff6e6]",
  dread: "text-[#4e5a70] border-[#c4cad6] bg-[#f0f2f6]",
  eerie: "text-[#6c3fb0] border-[#cdb7f0] bg-[#f4eefd]",
  sad: "text-[#2765a8] border-[#a9c7ea] bg-[#ecf4fd]",
};

interface Props {
  plan: StoryPlan;
  index: number;
  current: boolean;
  thumbs: Thumbnailer | null;
  canGenerateImage: boolean;
  imageBusy: boolean;
  narrationStale: boolean;
  disabled: boolean;
  onChange(patch: Partial<Scene>): void;
  onDelete(): void;
  onSeek(): void;
  onGenerateImage(): void;
  onUploadImage(file: File): void;
  onRemoveImage(): void;
  onPlayVoice(): void;
}

export function SceneRow(p: Props) {
  const s = p.plan.scenes[p.index];
  const thumb = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (thumb.current && p.thumbs) p.thumbs.draw(p.plan, p.index, thumb.current);
    // Redraw when anything visual about this scene changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.thumbs, s.visual, s.mood, s.effects.join(), s.image, s.duration, p.index]);

  const toggle = (key: "sfx" | "effects", v: string) => {
    const arr = s[key] as string[];
    p.onChange({ [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] } as Partial<Scene>);
  };

  return (
    <div className={`grid grid-cols-[54px_1fr] gap-3 rounded-2xl border-[1.5px] p-2.5 transition ${p.current ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-card-2"}`}>
      <button type="button" onClick={p.onSeek} title="Preview this scene" className="relative h-24 w-[54px] overflow-hidden rounded-xl bg-black">
        {s.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.image} alt="" className="size-full object-cover" />
        ) : (
          <canvas ref={thumb} width={108} height={192} className="block size-full" />
        )}
        <span className="absolute left-1 top-1 rounded-md bg-black/65 px-1.5 text-[10px] font-extrabold text-white">S{p.index + 1}</span>
        {p.imageBusy && (
          <span className="absolute inset-0 grid place-items-center bg-black/55">
            <span className="spinner" />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-col gap-1.5">
        <textarea
          value={s.text}
          disabled={p.disabled}
          onChange={(e) => p.onChange({ text: e.target.value })}
          aria-label={`Caption for scene ${p.index + 1}`}
          rows={2}
          className="-mx-1.5 -mt-1 w-[calc(100%+12px)] resize-none rounded-lg border-[1.5px] border-transparent bg-transparent px-1.5 py-1 text-[13.5px] font-semibold leading-snug outline-none [field-sizing:content] focus:border-line focus:bg-card"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold capitalize dark:bg-transparent ${MOOD_CLS[s.mood]}`}>{s.mood}</span>
          <select className="select-sm" aria-label="Visual" value={s.visual} disabled={p.disabled || !!s.image} onChange={(e) => p.onChange({ visual: e.target.value as Scene["visual"] })}>
            {VISUALS.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select className="select-sm" aria-label="Mood" value={s.mood} disabled={p.disabled} onChange={(e) => p.onChange({ mood: e.target.value as Scene["mood"] })}>
            {MOODS.map((v) => <option key={v}>{v}</option>)}
          </select>
          <input
            type="number"
            className="select-sm w-[62px]"
            aria-label="Duration in seconds"
            min={1}
            max={20}
            step={0.5}
            value={s.duration}
            disabled={p.disabled}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1 && v <= 20) p.onChange({ duration: v });
            }}
          />
          {s.narration ? (
            <button
              type="button"
              onClick={p.onPlayVoice}
              title={p.narrationStale ? "Caption changed since this was recorded" : "Play narration"}
              className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-xs font-semibold ${p.narrationStale ? "border-[#f2cf96] text-[#b46a00]" : "border-line text-muted hover:text-fg"}`}
            >
              {p.narrationStale ? <Mic size={13} /> : <Play size={12} />} {s.narration.duration.toFixed(1)}s
            </button>
          ) : null}
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={!p.canGenerateImage || p.imageBusy || p.disabled}
              onClick={p.onGenerateImage}
              title={p.canGenerateImage ? "Generate an AI image for this scene" : "AI images aren't configured on the server"}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-1.5 py-1 text-xs font-semibold text-muted hover:text-fg disabled:opacity-40"
            >
              <Sparkles size={13} /> AI image
            </button>
            <label title="Upload your own image" className={`inline-flex cursor-pointer items-center rounded-lg border border-line bg-card px-1.5 py-1 text-muted hover:text-fg ${p.disabled ? "pointer-events-none opacity-40" : ""}`}>
              <Upload size={13} />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) p.onUploadImage(f);
                  e.target.value = "";
                }}
              />
            </label>
            {s.image && (
              <button type="button" onClick={p.onRemoveImage} title="Remove image" className="inline-flex items-center rounded-lg border border-line bg-card px-1.5 py-1 text-muted hover:text-fg">
                <X size={13} />
              </button>
            )}
            <button type="button" onClick={p.onDelete} disabled={p.disabled} aria-label="Delete scene" className="inline-flex items-center rounded-lg border border-line bg-card px-1.5 py-1 text-muted hover:text-[#d4213a] disabled:opacity-40">
              <Trash2 size={13} />
            </button>
          </span>
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-muted [&::-webkit-details-marker]:hidden">
            Sound, effects &amp; image prompt · {s.sfx.length + s.effects.length} active
          </summary>
          <p className="label mb-1 mt-2">Sound</p>
          <div className="flex flex-wrap gap-1">
            {SFX.map((x) => (
              <Chip key={x} on={s.sfx.includes(x)} onClick={() => toggle("sfx", x)}>{x}</Chip>
            ))}
          </div>
          <p className="label mb-1 mt-2">Effects</p>
          <div className="flex flex-wrap gap-1">
            {EFFECTS.map((x) => (
              <Chip key={x} on={s.effects.includes(x)} onClick={() => toggle("effects", x)}>{x}</Chip>
            ))}
          </div>
          <p className="label mb-1 mt-2 flex items-center gap-1"><ImagePlus size={11} /> Image prompt</p>
          <textarea
            className="field min-h-16 px-3 py-2 text-[13px]"
            value={s.imagePrompt ?? ""}
            placeholder={s.text}
            onChange={(e) => p.onChange({ imagePrompt: e.target.value })}
          />
        </details>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-accent bg-accent-soft font-semibold text-accent-text" : "border-dashed border-line text-muted"}`}
    >
      {children}
    </button>
  );
}
