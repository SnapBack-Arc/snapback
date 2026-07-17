import { createClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser/client Supabase client using the public (anon/publishable) key.
 * Subject to Row Level Security. Safe to use in client components.
 */
export function createBrowserSupabase() {
  return createClient<Database>(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}
