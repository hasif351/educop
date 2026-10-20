import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

// Vercel Blob client uploads: the browser asks here for a short-lived upload
// token, then sends the video straight to storage (no 4.5 MB function limit).
// Only signed-in, active teachers get a token, for video files up to 2 GB.
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Video storage isn't connected." }, { status: 501 });
  let body: HandleUploadBody;
  try { body = (await req.json()) as HandleUploadBody; } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const s = await getSession();
        if (!s || s.role !== "TEACHER" || !s.schoolId) throw new Error("Only teachers can upload recordings.");
        const user = await db.user.findUnique({ where: { id: s.userId }, select: { active: true, school: { select: { active: true } } } });
        if (!user?.active || !user.school?.active) throw new Error("Only teachers can upload recordings.");
        if (!/^recordings\/[\w .()-]{1,120}\.(mp4|webm|mov)$/i.test(pathname)) throw new Error("Choose an .mp4, .webm or .mov file.");
        await audit(s, "recording.upload", pathname);
        return { allowedContentTypes: VIDEO_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
