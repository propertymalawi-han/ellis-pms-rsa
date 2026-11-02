import { redirect } from "next/navigation";

import { getActor } from "@/lib/auth/access";

export default async function HomePage() {
  const actor = await getActor();

  if (actor.ok && actor.isAdmin) {
    redirect("/dashboard");
  }

  redirect("/properties");
}
