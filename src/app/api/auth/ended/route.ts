import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// requireRole sends people here when their account or school was switched off
// mid-session: clear the cookie (middleware would otherwise bounce /login back).
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?ended=1", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
