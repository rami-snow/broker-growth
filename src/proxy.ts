import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/platform/auth/proxy-session";
import { getRuntimeMode } from "@/platform/runtime/config";
import { safeReturnPath } from "@/platform/runtime/return-url";

export async function proxy(request: NextRequest) {
  if (getRuntimeMode() === "fixture") return NextResponse.next();
  try {
    const { response, authenticated } = await refreshSupabaseSession(request);
    const isSignIn = request.nextUrl.pathname === "/sign-in";
    if (!authenticated && !isSignIn) {
      const target = request.nextUrl.clone();
      target.pathname = "/sign-in";
      target.search = "";
      target.searchParams.set("returnTo", safeReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
      return NextResponse.redirect(target);
    }
    if (authenticated && isSignIn) return NextResponse.redirect(new URL(safeReturnPath(request.nextUrl.searchParams.get("returnTo")), request.url));
    return response;
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Supabase runtime configuration failed", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
