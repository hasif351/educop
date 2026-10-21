// Pure rules for Educop live (LiveKit). src/lib/livekit.ts issues the tokens
// and calls the LiveKit API; this file decides who may do what.

/** Tokens live for 2 hours: long enough for a class, short enough not to be reused later. */
export const TOKEN_TTL_SEC = 2 * 60 * 60;

export type PublishSource = "camera" | "microphone" | "screen_share" | "screen_share_audio";
export type LiveRole = "TEACHER" | "STUDENT";

/** What the token lets a person do in the room. Mirrors LiveKit's VideoGrant. */
export type RoomGrant = {
  room: string;
  roomJoin: true;
  roomAdmin: boolean;
  canSubscribe: true;
  canPublish: boolean;
  canPublishData: true;
  canPublishSources: PublishSource[];
};

/** A student's permission while the teacher has invited them to speak (or not). Camera stays optional. */
export function speakerPermission(on: boolean) {
  return { canSubscribe: true, canPublishData: true, canPublish: on, canPublishSources: on ? (["microphone", "camera"] as PublishSource[]) : [] };
}

/**
 * Teachers publish camera, mic and screen share and manage the room. Students
 * watch and listen, and use mic and camera only while the teacher invites them.
 */
export function grantFor(role: LiveRole, room: string, canSpeak = false): RoomGrant {
  if (role === "TEACHER") {
    return { room, roomJoin: true, roomAdmin: true, canSubscribe: true, canPublish: true, canPublishData: true, canPublishSources: ["camera", "microphone", "screen_share", "screen_share_audio"] };
  }
  return { room, roomJoin: true, roomAdmin: false, canSubscribe: true, canPublishData: true, canPublish: canSpeak, canPublishSources: speakerPermission(canSpeak).canPublishSources };
}

/**
 * May this person get a video token right now? Only while the class is live,
 * and a student only after "Join class" recorded their attendance.
 */
export function mayGetToken(p: { role: LiveRole; status: string; joined: boolean }) {
  if (p.status !== "LIVE") return false;
  return p.role === "TEACHER" || p.joined;
}

/** Participant metadata: only the role, so the stage can tell the teacher apart. */
export function participantMetadata(role: LiveRole) {
  return JSON.stringify({ role: role === "TEACHER" ? "teacher" : "student" });
}

export function roleFromMetadata(md: string | undefined | null): "teacher" | "student" {
  try { return JSON.parse(md ?? "")?.role === "teacher" ? "teacher" : "student"; } catch { return "student"; }
}

type Env = Record<string, string | undefined>;

/** Educop live is offered only when all three LiveKit settings are present and the URL is a WebSocket address. */
export function livekitConfigured(env: Env) {
  const url = env.LIVEKIT_URL?.trim();
  return !!(url && /^wss?:\/\/[^\s/]+/i.test(url) && env.LIVEKIT_API_KEY?.trim() && env.LIVEKIT_API_SECRET?.trim());
}

/** The LiveKit server API lives on the same host over http(s). */
export function livekitApiHost(wsUrl: string) {
  return wsUrl.trim().replace(/^ws(s?):\/\//i, "http$1://").replace(/\/+$/, "");
}

/** "Mute all" and the stage use this to find students' microphones. */
export function isStudentMic(p: { metadata?: string | null }, source: string) {
  return roleFromMetadata(p.metadata) === "student" && source === "microphone";
}

/** Record button: the main stage is the teacher's screen share if any, else their camera. */
export function recordingSource<T>(t: { screen: T | null | undefined; camera: T | null | undefined }): { kind: "screen" | "camera"; track: T } | null {
  if (t.screen) return { kind: "screen", track: t.screen };
  if (t.camera) return { kind: "camera", track: t.camera };
  return null;
}

/** File name for a browser recording, safe for the upload route's pattern. */
export function recordingFileName(title: string, at: Date) {
  const slug = title.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "class";
  return `live-${slug}-${at.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`;
}
