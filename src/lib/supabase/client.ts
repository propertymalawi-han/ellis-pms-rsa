import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export function createClient() {
  const { url, anonKey } = requireSupabasePublicEnv();

  return createBrowserClient<Database>(url, anonKey);
}
