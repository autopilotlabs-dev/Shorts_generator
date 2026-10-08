import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-form";
import { currentUser } from "@/lib/server/session";

export const metadata = { title: "Sign in · Nightshade" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/studio");
  return <AuthPage mode="login" />;
}
