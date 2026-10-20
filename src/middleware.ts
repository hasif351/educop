import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ROLE_HOME, roleForPath } from "@/lib/roles";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/" || pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
    if (pathname === "/") return NextResponse.redirect(new URL("/login", req.url));
    return NextResponse.next();
  }

  const needed = roleForPath(pathname);
  if (!needed) return NextResponse.next();
  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session.role !== needed) return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico|api/health).*)"] };
