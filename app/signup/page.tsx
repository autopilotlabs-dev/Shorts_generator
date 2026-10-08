import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-form";
import { currentUser } from "@/lib/server/session";

export const metadata = { title: "Create account · Nightshade" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/studio");
  return <AuthPage mode="signup" />;
}
