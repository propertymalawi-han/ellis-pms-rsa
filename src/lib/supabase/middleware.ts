import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { POST_LOGIN_PATH } from "@/lib/auth/paths";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/auth/callback";
}

function copySessionCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = from.headers.get(header);
    if (value) {
      to.headers.set(header, value);
    }
  }

  return to;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const env = getSupabasePublicEnv();

  if (!env) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = POST_LOGIN_PATH;
    url.search = "";
    return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
