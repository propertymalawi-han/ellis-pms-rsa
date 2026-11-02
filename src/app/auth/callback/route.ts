import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { POST_LOGIN_PATH } from "@/lib/auth/paths";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return POST_LOGIN_PATH;
  }

  return value;
}

function redirectWithSession(
  url: URL,
  cookies: PendingCookie[],
  headers: Record<string, string>,
): NextResponse {
  const response = NextResponse.redirect(url);

  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", requestUrl.origin));
  }

  const { url, anonKey } = requireSupabasePublicEnv();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach((cookie) => {
          request.cookies.set(cookie.name, cookie.value);
          const existing = pendingCookies.findIndex((item) => item.name === cookie.name);
          if (existing >= 0) {
            pendingCookies[existing] = cookie;
          } else {
            pendingCookies.push(cookie);
          }
        });
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectWithSession(
      new URL("/login?error=auth", requestUrl.origin),
      pendingCookies,
      pendingHeaders,
    );
  }

  const { error: logError } = await supabase.rpc("log_login");

  if (logError) {
    await supabase.auth.signOut();
    return redirectWithSession(
      new URL("/login?error=audit", requestUrl.origin),
      pendingCookies,
      pendingHeaders,
    );
  }

  return redirectWithSession(
    new URL(nextPath, requestUrl.origin),
    pendingCookies,
    pendingHeaders,
  );
}
