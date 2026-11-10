import { createMiddleware } from "@tanstack/react-start";
import { isBrowserStorageAvailable, withStorageAuth } from "./browser-storage";

/** Public reads continue without creating an auth client when browser storage is blocked. */
export const attachStorageSafeAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const session = await withStorageAuth(isBrowserStorageAvailable(), async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      return supabase.auth.getSession();
    });
    const token = session?.data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);