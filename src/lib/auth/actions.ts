"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { POST_LOGIN_PATH } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginValues = z.infer<typeof loginSchema>;

function loginErrorMessage(code: string | undefined): string {
  if (code === "email_not_confirmed") {
    return "Confirm your email, then sign in.";
  }

  return "Email or password is incorrect.";
}

export async function login(
  values: LoginValues,
): Promise<{ error: string } | undefined> {
  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    return { error: "Email or password is incorrect." };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Supabase is not configured. Add your keys to .env.local.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: loginErrorMessage(error.code) };
  }

  const { error: logError } = await supabase.rpc("log_login");

  if (logError) {
    await supabase.auth.signOut();
    return { error: "Could not record this sign-in. Try again." };
  }

  redirect(POST_LOGIN_PATH);
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still send the user to login if Supabase is not configured yet.
  }

  redirect("/login");
}
