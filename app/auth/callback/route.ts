import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const client = code ? createClient(await cookies()) : null;
  if (code && client) {
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) {
      return new NextResponse(null, { status: 303, headers: { Location: "/?auth=confirmed" } });
    }
  }

  return new NextResponse(null, { status: 303, headers: { Location: "/?auth=failed" } });
}
