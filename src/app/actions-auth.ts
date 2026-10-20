"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { SESSION_COOKIE, signSession, sessionTtlSeconds } from "@/lib/session";
import { ROLE_HOME, roleForPath } from "@/lib/roles";
import { clearFailures, isBlocked, recordFailure } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, next } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `login:${ip}:${email}`;
  const rl = isBlocked(key, 5);
  if (rl.blocked) return { error: `Too many failed attempts. Try again in ${Math.ceil(rl.retryInSec / 60)} minutes.` };

  const user = await db.user.findUnique({ where: { email }, include: { school: true } });
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal accounts.
  const hash = user?.passwordHash ?? "$2b$10$F6zerK7j4ObKWNm/cQgSLeqmrAly0wpIJYYTx6ybp27VcC0X5JLiu";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok || !user.active || (user.school && !user.school.active)) {
    recordFailure(key, 15 * 60 * 1000);
    return { error: "That email and password don't match an active account." };
  }

  clearFailures(key);
  const token = await signSession({ userId: user.id, role: user.role, schoolId: user.schoolId, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, schoolId: user.schoolId }, "auth.login");

  // Only follow ?next= when it points inside this user's own area.
  const dest = next && next.startsWith("/") && roleForPath(next) === user.role ? next : ROLE_HOME[user.role];
  redirect(dest);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
