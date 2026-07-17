import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requirePublicEnv, requireServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * Bypasses Row Level Security — only import from server code (route handlers,
 * server actions, server components). Never ship this to the browser.
 */
export function createServiceSupabase() {
  return createClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
