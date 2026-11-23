import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/profile/load";
import { isComplete } from "@/lib/profile/schema";

/** Entry point: route the user to the next thing they need to do. */
export default async function Home() {
  const { profile } = await getUserAndProfile();
  redirect(isComplete(profile) ? "/plan" : "/onboarding");
}
