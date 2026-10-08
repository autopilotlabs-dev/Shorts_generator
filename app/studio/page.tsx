import { Ghost } from "lucide-react";
import Link from "next/link";
import { DeleteProjectButton, NewStoryButton } from "@/components/project-actions";
import { Arrow } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { currentUser } from "@/lib/server/auth";
import { totalDuration } from "@/lib/engine/types";
import { latestRenderByProject, listProjects, posterOf, userStats } from "@/lib/server/projects";

export const metadata = { title: "Dashboard · Nightshade" };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const STATUS = {
  done: { label: "Rendered", cls: "text-ok border-ok/40 bg-ok/10" },
  rendering: { label: "Rendering", cls: "text-[#b46a00] border-[#f2cf96] bg-[#fff6e6] dark:bg-transparent" },
  queued: { label: "Queued", cls: "text-[#b46a00] border-[#f2cf96] bg-[#fff6e6] dark:bg-transparent" },
  failed: { label: "Failed", cls: "text-accent-text border-accent/40 bg-accent-soft" },
} as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = (await currentUser())!;
  const q = ((await searchParams).q ?? "").trim().toLowerCase();
  const all = listProjects(user.id);
  const projects = q ? all.filter((p) => `${p.title} ${p.story}`.toLowerCase().includes(q)) : all;
  const renders = latestRenderByProject(user.id);
  const stats = userStats(user.id);
  const first = user.name.split(" ")[0];

  const tiles = [
    { label: "Stories", value: stats.projects, foot: "in your studio" },
    { label: "Videos rendered", value: stats.renders, foot: "MP4s in your library" },
    { label: "Minutes of horror", value: (stats.seconds / 60).toFixed(1), foot: "total runtime" },
    { label: "In progress", value: stats.active, foot: stats.active ? "rendering now" : "nothing queued" },
  ];

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-bento bg-card px-6 py-[22px]">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.03em] max-[560px]:text-[28px]">
            {greeting()}, <span className="text-muted">{first}</span>
          </h1>
          <p className="mt-1 text-muted">Pick up a story or start a new nightmare.</p>
        </div>
        <NewStoryButton />
      </section>

      <section className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2">
        {tiles.map((t, i) => (
          <article key={t.label} className={`card ${i === 0 ? "hero-grad text-white" : ""}`}>
            <div className="flex items-center justify-between">
              <h2 className="card-title">{t.label}</h2>
              <Arrow className={i === 0 ? "border-white bg-white !text-[#111]" : ""} />
            </div>
            <div className="text-[52px] font-semibold leading-none tracking-[-0.04em] max-[560px]:text-[40px]">{t.value}</div>
            <p className={`text-[12.5px] ${i === 0 ? "text-[#ffd5db]" : "text-muted"}`}>{t.foot}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="card-title">{q ? `Stories matching “${q}”` : "Your stories"}</h2>
          <span className="text-[12.5px] text-muted">{projects.length} total</span>
        </div>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <Ghost size={26} />
            </span>
            <p className="font-semibold">{q ? "No stories match your search." : "No stories yet."}</p>
            <p className="max-w-[40ch] text-sm text-muted">Write a short horror story and we&apos;ll turn it into a narrated, animated video.</p>
            {!q && <NewStoryButton />}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
            {projects.map((p) => {
              const r = renders.get(p.id);
              const poster = posterOf(r?.status === "done" ? r : null) ?? p.plan?.scenes.find((s) => s.image)?.image ?? null;
              const status = r ? STATUS[r.status] : null;
              const dur = p.plan ? totalDuration(p.plan) : 0;
              return (
                <Link key={p.id} href={`/studio/${p.id}`} className="group flex flex-col gap-2.5 rounded-[18px] p-2 transition hover:bg-card-2">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-night">
                    {poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={poster} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-[#6f707a]" style={{ background: "repeating-linear-gradient(45deg,#ffffff06 0 6px,transparent 6px 14px)" }}>
                        <Ghost size={30} />
                        <span className="text-xs">{p.plan ? `${p.plan.scenes.length} scenes` : "Draft"}</span>
                      </div>
                    )}
                    <div className="absolute right-2 top-2">
                      <DeleteProjectButton id={p.id} title={p.title} />
                    </div>
                    {dur > 0 && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white">{dur.toFixed(0)}s</span>}
                  </div>
                  <div className="min-w-0 px-1">
                    <div className="truncate font-bold">{p.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{timeAgo(p.updatedAt)}</span>
                      {status ? (
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
                      ) : (
                        <span className="rounded-md border border-line px-2 py-0.5 text-[11px] font-bold">Draft</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
