import { Download, Film } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/format";
import { currentUser } from "@/lib/server/session";
import { listProjects, listRenders } from "@/lib/server/projects";

export const metadata = { title: "Video library · Nightshade" };

export default async function Library() {
  const user = (await currentUser())!;
  const [projects, renders] = await Promise.all([listProjects(user.id), listRenders(user.id, undefined, 100)]);
  const titles = new Map(projects.map((p) => [p.id, p.title]));
  const videos = renders.filter((r) => r.status === "done" && r.videoUrl);
  return (
    <>
      <section className="rounded-bento bg-card px-6 py-[22px]">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Video library</h1>
        <p className="mt-1 text-muted">Every short you&apos;ve rendered, ready to download.</p>
      </section>
      <section className="card">
        {videos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-muted">
            <Film size={28} />
            <p>No videos yet. Open a story and press <b className="text-fg">Render MP4</b>.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {videos.map((v) => {
              const title = titles.get(v.projectId) ?? "Untitled";
              return (
                <article key={v.id} className="flex flex-col gap-2.5 rounded-[18px] bg-card-2 p-2">
                  <video src={v.videoUrl!} poster={v.posterUrl ?? undefined} controls preload="none" playsInline className="aspect-[9/16] w-full rounded-2xl bg-black object-cover" />
                  <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    <div className="min-w-0">
                      <Link href={`/studio/${v.projectId}`} className="block truncate font-bold hover:underline">{title}</Link>
                      <span className="text-xs text-muted">
                        {v.duration?.toFixed(0)}s · {((v.size ?? 0) / 1e6).toFixed(1)} MB · {timeAgo(v.createdAt)}
                      </span>
                    </div>
                    <a href={`${v.videoUrl}?download=${encodeURIComponent(title.replace(/\s+/g, "-").toLowerCase())}.mp4`} className="arrow-btn shrink-0" aria-label={`Download ${title}`}>
                      <Download size={15} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
