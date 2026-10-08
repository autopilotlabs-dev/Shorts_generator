"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const { error } = signup
      ? await authClient.signUp.email({ email, password, name: String(f.get("name")).trim() })
      : await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message || "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    router.push("/studio");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      {signup && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Name
          <input name="name" required maxLength={60} autoComplete="name" className="field font-normal" placeholder="Edgar Allan" />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Email
        <input name="email" type="email" required autoComplete="email" className="field font-normal" placeholder="you@example.com" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={signup ? "new-password" : "current-password"}
          className="field font-normal"
          placeholder={signup ? "At least 8 characters" : "••••••••"}
        />
      </label>
      {error && <p className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm font-medium text-accent-text">{error}</p>}
      <button className="btn btn-primary mt-1" disabled={busy}>
        {busy && <span className="spinner" />}
        {signup ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        {signup ? "Already have an account? " : "New here? "}
        <Link href={signup ? "/login" : "/signup"} className="font-semibold text-accent-text hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="grid w-full max-w-[920px] grid-cols-[1.1fr_1fr] gap-3.5 rounded-[32px] bg-shell p-3.5 max-[760px]:grid-cols-1">
        <div className="night-grad flex flex-col justify-between gap-10 rounded-bento p-7 text-white max-[760px]:hidden">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold">
            <span className="inline-flex size-8 items-center justify-center gap-1 rounded-full accent-grad">
              <i className="block h-2 w-1.5 rounded-full bg-white" />
              <i className="block h-2 w-1.5 rounded-full bg-white" />
            </span>
            Nightshade
          </Link>
          <div>
            <p className="mb-3 font-[Creepster] text-5xl leading-none text-[#ff2e47]">Don&apos;t look back.</p>
            <p className="max-w-[34ch] text-[#b9bac2]">Write a horror story. Get a narrated, animated short with sound design and captions — ready for Shorts, Reels and TikTok.</p>
          </div>
          <div className="flex gap-2 text-xs text-[#8c8d96]">
            <span className="rounded-full border border-[#ffffff1f] px-3 py-1.5">10–60s vertical</span>
            <span className="rounded-full border border-[#ffffff1f] px-3 py-1.5">AI voice</span>
            <span className="rounded-full border border-[#ffffff1f] px-3 py-1.5">MP4 export</span>
          </div>
        </div>
        <div className="card justify-center p-7">
          <h1 className="text-[28px] font-bold tracking-tight">{mode === "signup" ? "Create your studio" : "Welcome back"}</h1>
          <p className="-mt-2 mb-2 text-muted">{mode === "signup" ? "Your stories and videos are saved to your account." : "Sign in to continue your stories."}</p>
          <AuthForm mode={mode} />
        </div>
      </div>
    </div>
  );
}
