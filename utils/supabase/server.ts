import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";
import { fetchWithTimeout } from "./fetch";
import { getSupabaseConfig } from "./config";

export function createClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createServerClient(config.url, config.publishableKey, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes sessions.
        }
      },
    },
  });
}
