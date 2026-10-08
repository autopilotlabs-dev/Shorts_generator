"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { msg: string; error?: boolean } | null;
const Ctx = createContext<(msg: string, error?: boolean) => void>(() => {});

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-2xl px-[18px] py-3 text-[13.5px] font-medium text-white shadow-[0_12px_30px_-10px_#0008] transition-all duration-200 ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        } ${toast?.error ? "bg-[#8f1024]" : "bg-night"}`}
      >
        {toast?.msg}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
