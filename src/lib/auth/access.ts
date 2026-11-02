import { createClient } from "@/lib/supabase/server";

type AppSupabase = Awaited<ReturnType<typeof createClient>>;

export type Actor =
  | { ok: true; supabase: AppSupabase; userId: string; isAdmin: boolean }
  | { ok: false; message: string };

export async function getActor(): Promise<Actor> {
  let supabase: AppSupabase;

  try {
    supabase = await createClient();
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Supabase is not configured. Add your keys to .env.local.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "You need to sign in." };
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  if (error || isAdmin === null) {
    if (error) {
      console.error(error.message);
    }

    return { ok: false, message: "Could not confirm your access." };
  }

  return { ok: true, supabase, userId: user.id, isAdmin };
}
