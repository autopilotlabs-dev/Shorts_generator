import { AudioLines, Captions, Clapperboard, Film, Mic, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoCanvas } from "@/components/demo-canvas";
import { Logo, ThemeButton } from "@/components/ui";
import { currentUser } from "@/lib/server/session";

const FEATURES = [
  { icon: Sparkles, title: "AI director", text: "Claude breaks your story into timed scenes and picks visuals, mood and sound cues." },
  { icon: Mic, title: "Narration", text: "Choose a chilling narrator voice. Scene timing fits the voice-over automatically." },
  { icon: Clapperboard, title: "Animated scenes", text: "13 animated horror sets, or AI-generated images per scene, with fog, lightning and glitches." },
  { icon: AudioLines, title: "Sound design", text: "A mood-driven score plus heartbeats, whispers, knocks and stingers, mixed under the voice." },
  { icon: Captions, title: "Captions", text: "Word-by-word captions in three styles, made for watching on mute." },
  { icon: Film, title: "MP4 export", text: "Rendered on the server in 1080×1920. Saved to your library, ready to upload." },
];

export default async function Home() {
  if (await currentUser()) redirect("/studio");
  return (
    <div className="mx-auto my-4 max-w-[1240px] rounded-[32px] bg-shell p-3.5 max-[900px]:m-0 max-[900px]:rounded-none max-[900px]:p-2.5">
      <header className="mb-3.5 flex items-center justify-between rounded-bento bg-card px-4 py-3">
        <span className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight">
          <Logo /> Nightshade
        </span>
        <div className="flex items-center gap-2">
          <ThemeButton />
          <Link href="/login" className="btn btn-outline btn-sm max-[480px]:hidden">Sign in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Get started</Link>
        </div>
      </header>

      <section className="grid grid-cols-[1.4fr_1fr] gap-3.5 max-[860px]:grid-cols-1">
        <div className="card justify-between gap-8 p-8 max-[560px]:p-5">
          <span className="chip w-fit"><span className="size-1.5 rounded-full bg-accent" /> Horror shorts in minutes</span>
          <div>
            <h1 className="text-[56px] font-bold leading-[1.02] tracking-[-0.04em] max-[560px]:text-[38px]">
              Turn your scariest story into a <span className="text-accent-text">short video</span>.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[17px] text-muted">
              Paste a story and get a narrated, animated 10–60 second vertical video with sound design and captions, ready for Shorts, Reels and TikTok.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/signup" className="btn btn-primary">Create your first short</Link>
            <Link href="/login" className="btn btn-outline">I have an account</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 max-[560px]:grid-cols-1">
            {[
              ["10–60s", "vertical 9:16"],
              ["1080p", "MP4 export"],
              ["14", "sound effects"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-card-2 p-4">
                <div className="text-3xl font-semibold tracking-tight">{v}</div>
                <div className="text-xs text-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="night-grad flex flex-col items-center gap-3 rounded-bento p-5 text-white">
          <div className="flex w-full items-center justify-between">
            <h2 className="font-bold">Live preview</h2>
            <span className="rounded-full bg-[#e0263f] px-2.5 py-1 text-[11px] font-bold">● Playing</span>
          </div>
          <div className="aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[18px] bg-black shadow-[0_0_0_1px_#ffffff14,0_20px_40px_-20px_#000]">
            <DemoCanvas />
          </div>
          <p className="text-xs text-[#8c8d96]">Rendered live in your browser from a 70-word story.</p>
        </div>
      </section>

      <section className="mt-3.5 grid grid-cols-3 gap-3.5 max-[860px]:grid-cols-2 max-[560px]:grid-cols-1">
        {FEATURES.map((f, i) => (
          <article key={f.title} className={`card ${i === 0 ? "hero-grad text-white" : ""}`}>
            <span className={`inline-flex size-10 items-center justify-center rounded-full ${i === 0 ? "bg-white text-[#111]" : "bg-accent-soft text-accent-text"}`}>
              <f.icon size={19} />
            </span>
            <h3 className="text-lg font-bold">{f.title}</h3>
            <p className={i === 0 ? "text-[#ffd5db]" : "text-muted"}>{f.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
