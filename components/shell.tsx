"use client";
import { CircleHelp, Film, LayoutGrid, LogOut, Moon, Plus, Search, Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/client/api";
import type { Capabilities } from "@/lib/server/capabilities";
import { useToast } from "./toast";
import { initials, Logo, ThemeButton, useTheme } from "./ui";

interface ShellUser {
  name: string;
  email: string;
}

export function useNewProject() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const { project } = await api<{ project: { id: string } }>("/api/projects", { method: "POST", json: {} });
      router.push(`/studio/${project.id}`);
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  };
  return { create, busy };
}

function NavLink({ href, icon, children, badge }: { href: string; icon: React.ReactNode; children: React.ReactNode; badge?: number }) {
  const path = usePathname();
  const active = href === "/studio" ? path === "/studio" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition hover:bg-card-2 hover:text-fg ${active ? "font-bold text-fg" : "text-muted"}`}
    >
      {active && <span className="absolute -left-4 top-2 bottom-2 w-1 rounded-r bg-accent max-[900px]:hidden" />}
      <span className={active ? "text-accent" : ""}>{icon}</span>
      {children}
      {badge ? <span className="ml-auto rounded-md bg-accent-2 px-1.5 text-[11px] font-bold text-white">{badge}</span> : null}
    </Link>
  );
}

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q ? `/studio?q=${encodeURIComponent(q)}` : "/studio");
      }}
      className="flex min-w-0 flex-[0_1_380px] items-center gap-2.5 rounded-full bg-card-2 py-2 pl-4 pr-2 text-muted"
    >
      <Search size={17} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stories…" aria-label="Search stories" className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
      <kbd className="rounded-md border border-line bg-card px-1.5 py-1 text-[11px] font-semibold text-muted">↵</kbd>
    </form>
  );
}

export function AppShell({ user, caps, projectCount, children }: { user: ShellUser; caps: Capabilities; projectCount: number; children: React.ReactNode }) {
  const router = useRouter();
  const [theme, toggleTheme] = useTheme();
  const { create, busy } = useNewProject();
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };
  const navBtn = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium text-muted transition hover:bg-card-2 hover:text-fg";
  const enabled = [caps.ai && "AI director", caps.tts.provider && "Voice", caps.images && "AI images"].filter(Boolean) as string[];

  return (
    <div className="mx-auto my-4 grid min-h-[calc(100vh-32px)] max-w-[1440px] grid-cols-[236px_1fr] gap-3.5 rounded-[32px] bg-shell p-3.5 max-[900px]:m-0 max-[900px]:min-h-screen max-[900px]:grid-cols-1 max-[900px]:rounded-none max-[900px]:p-2.5">
      <aside className="sticky top-4 flex h-[calc(100vh-60px)] flex-col self-start rounded-bento bg-card px-4 pb-4 pt-[22px] max-[900px]:static max-[900px]:h-auto max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:items-center max-[900px]:gap-1 max-[900px]:py-3">
        <Link href="/studio" className="flex items-center gap-2.5 px-2 pb-[18px] text-[19px] font-extrabold tracking-tight max-[900px]:pb-0">
          <Logo /> Nightshade
        </Link>
        <p className="label mx-2.5 mb-1.5 mt-4 max-[900px]:hidden">Menu</p>
        <nav className="flex flex-col gap-0.5 max-[900px]:flex-row max-[900px]:flex-wrap">
          <NavLink href="/studio" icon={<LayoutGrid size={18} />} badge={projectCount}>
            Dashboard
          </NavLink>
          <NavLink href="/studio/library" icon={<Film size={18} />}>
            Video library
          </NavLink>
          <button type="button" className={navBtn} onClick={create} disabled={busy}>
            <Plus size={18} /> New story
          </button>
        </nav>
        <p className="label mx-2.5 mb-1.5 mt-4 max-[900px]:hidden">General</p>
        <nav className="flex flex-col gap-0.5 max-[900px]:flex-row">
          <button type="button" className={navBtn} onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />} {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <a className={navBtn} href="https://github.com/autopilotlabs-dev/Shorts_generator#readme" target="_blank" rel="noopener">
            <CircleHelp size={18} /> Help
          </a>
          <button type="button" className={navBtn} onClick={logout}>
            <LogOut size={18} /> Log out
          </button>
        </nav>
        <div className="relative mt-auto overflow-hidden rounded-[18px] p-4 text-white max-[900px]:hidden" style={{ background: "radial-gradient(120% 90% at 100% 0%, #3d0c15 0%, transparent 60%), var(--night)" }}>
          <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-white text-[#111]">
            <Sparkles size={16} />
          </span>
          <h3 className="mb-1 mt-2.5 text-base font-bold">{enabled.length ? "AI studio is on" : "AI studio"}</h3>
          <p className="relative z-10 text-[12.5px] text-[#b9bac2]">
            {enabled.length
              ? `${enabled.join(", ")} ready. Write a story and press Generate.`
              : "Running with the built-in planner. Add API keys on the server to unlock AI scenes, voices and images."}
          </p>
          <span className="absolute -bottom-10 -right-10 size-[140px] rounded-full border-[18px] border-[#e0263f2e]" />
        </div>
      </aside>

      <main className="flex min-w-0 flex-col gap-3.5 max-[560px]:gap-2.5">
        <header className="flex items-center justify-between gap-3 rounded-bento bg-card px-3.5 py-3">
          <Suspense fallback={<div className="flex-[0_1_380px]" />}>
            <SearchBox />
          </Suspense>
          <div className="flex items-center gap-2.5">
            <ThemeButton />
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-10 items-center justify-center rounded-full accent-grad text-sm font-bold text-white">{initials(user.name)}</span>
              <div className="leading-tight max-[640px]:hidden">
                <div className="text-sm font-bold">{user.name}</div>
                <div className="text-xs text-muted">{user.email}</div>
              </div>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
