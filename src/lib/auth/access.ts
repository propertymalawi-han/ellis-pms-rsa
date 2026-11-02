import { cache } from "react";

import type { SessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type AppSupabase = Awaited<ReturnType<typeof createClient>>;

export type Actor =
  | { ok: true; supabase: AppSupabase; userId: string; isAdmin: boolean }
  | { ok: false; message: string };

type SessionContext =
  | {
      ok: true;
      supabase: AppSupabase;
      userId: string;
      isAdmin: boolean;
      user: SessionUser;
    }
  | { ok: false; message: string };

const loadSession = cache(async (): Promise<SessionContext> => {
  if (!getSupabasePublicEnv()) {
    return {
      ok: false,
      message: "Supabase is not configured. Add your keys to .env.local.",
    };
  }

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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.role) {
    if (error) {
      console.error(error.message);
    }

    return { ok: false, message: "Could not confirm your access." };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    isAdmin: profile.role === "owner" || profile.role === "partner",
    user: {
      id: user.id,
      email: profile.email ?? user.email ?? null,
      fullName: profile.full_name,
      role: profile.role,
    },
  };
});

export const getActor = cache(async (): Promise<Actor> => {
  const session = await loadSession();

  if (!session.ok) {
    return session;
  }

  return {
    ok: true,
    supabase: session.supabase,
    userId: session.userId,
    isAdmin: session.isAdmin,
  };
});

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await loadSession();
  return session.ok ? session.user : null;
});
