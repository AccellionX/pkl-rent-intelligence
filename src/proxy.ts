import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function isPublicPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/api/health") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico"
  );
}

/**
 * Next.js 16 proxy (formerly middleware).
 * - Refreshes Supabase auth cookies when configured
 * - Redirects unauthenticated users to /login for all app pages
 * - Never falls back to demo/sample UI for missing auth
 * API routes enforce their own auth; this is UX + session refresh only.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const env = getSupabasePublicEnv();

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  let user: { id: string } | null = null;

  if (env) {
    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
  }

  const isApi = path.startsWith("/api/");
  if (!user && !isPublicPath(path) && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = path + (request.nextUrl.search || "");
    if (next && next !== "/") {
      url.searchParams.set("next", next);
    }
    return NextResponse.redirect(url);
  }

  // Authenticated users hitting /login go to dashboard (or safe next).
  if (user && path === "/login" && env) {
    const next = request.nextUrl.searchParams.get("next");
    const dest =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const url = request.nextUrl.clone();
    url.pathname = dest;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
