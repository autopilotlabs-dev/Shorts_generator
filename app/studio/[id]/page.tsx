import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { currentUser } from "@/lib/server/auth";
import { capabilities } from "@/lib/server/capabilities";
import { getProject, listRenders } from "@/lib/server/projects";
import { ensureWorkers } from "@/lib/server/render-queue";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await currentUser())!;
  const project = getProject(user.id, (await params).id);
  if (!project) notFound();
  ensureWorkers();
  return <Editor key={project.id} initial={project} caps={await capabilities()} initialRenders={listRenders(user.id, project.id)} />;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const p = user ? getProject(user.id, (await params).id) : null;
  return { title: `${p?.title ?? "Story"} · Nightshade` };
}
