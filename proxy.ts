import type { NextRequest } from "next/server";
import { updateSession } from "./utils/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Public pages use the browser session. Only server APIs need session refresh here.
  matcher: ["/api/:path*"],
};
