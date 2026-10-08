import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/toast";

export const metadata: Metadata = {
  title: "Nightshade Studio",
  description: "Turn horror stories into narrated, animated 10–60 second short videos.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='9' fill='%23a3132a'/><circle cx='12' cy='14' r='3' fill='white'/><circle cx='20' cy='14' r='3' fill='white'/></svg>",
  },
};

// Applies the saved (or OS) theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
