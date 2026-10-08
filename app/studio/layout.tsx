import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { currentUser } from "@/lib/server/session";
import { capabilities } from "@/lib/server/capabilities";
import { userStats } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user} caps={capabilities()} projectCount={(await userStats(user.id)).projects}>
      {children}
    </AppShell>
  );
}
