import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { currentUser } from "@/lib/server/session";
import { capabilities } from "@/lib/server/capabilities";
import { getProject, listRenders } from "@/lib/server/projects";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await currentUser())!;
  const project = await getProject(user.id, (await params).id);
  if (!project) notFound();
  return <Editor key={project.id} initial={project} caps={capabilities()} initialRenders={await listRenders(user.id, project.id)} />;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const p = user ? await getProject(user.id, (await params).id) : null;
  return { title: `${p?.title ?? "Story"} · Nightshade` };
}
