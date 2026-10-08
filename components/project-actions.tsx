"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useNewProject } from "./shell";
import { useToast } from "./toast";

export function NewStoryButton({ className = "btn btn-primary" }: { className?: string }) {
  const { create, busy } = useNewProject();
  return (
    <button type="button" className={className} onClick={create} disabled={busy}>
      {busy ? <span className="spinner" /> : <Plus size={18} />} New story
    </button>
  );
}

export function DeleteProjectButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Delete ${title}`}
      className="inline-flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-[#8f1024] group-hover:opacity-100 focus-visible:opacity-100 max-[900px]:opacity-100"
      onClick={async (e) => {
        e.preventDefault();
        if (!confirm(`Delete "${title}" and its videos? This can't be undone.`)) return;
        try {
          await api(`/api/projects/${id}`, { method: "DELETE" });
          toast("Story deleted.");
          router.refresh();
        } catch (err) {
          toast((err as Error).message, true);
        }
      }}
    >
      <Trash2 size={15} />
    </button>
  );
}
