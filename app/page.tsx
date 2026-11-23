import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/profile/load";
import { isComplete } from "@/lib/profile/schema";

/** Entry point: route the user to the next thing they need to do. */
export default async function Home() {
  const { profile } = await getUserAndProfile();
  // Phase 3 will send complete profiles to the weekly plan instead.
  redirect(isComplete(profile) ? "/targets" : "/onboarding");
}
