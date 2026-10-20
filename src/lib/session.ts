import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "educop_session";

export type SessionPayload = {
  userId: string;
  role: Role;
  schoolId: string | null;
  name: string;
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export function sessionTtlSeconds() {
  return Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600;
}

export async function signSession(p: SessionPayload) {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionTtlSeconds()}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return {
      userId: String(payload.userId),
      role: payload.role as Role,
      schoolId: (payload.schoolId as string | null) ?? null,
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
