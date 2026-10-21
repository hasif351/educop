import "server-only";
import { AccessToken, RoomServiceClient, TrackSource, trackSourceToString, type VideoGrant } from "livekit-server-sdk";
import { TOKEN_TTL_SEC, grantFor, isStudentMic, livekitApiHost, livekitConfigured, participantMetadata, speakerPermission, type LiveRole, type PublishSource } from "./livekit-utils";

// Educop live (beta): LiveKit access tokens and room control. The API key and
// secret never leave the server; the browser only gets its own short-lived token.

const SOURCE: Record<PublishSource, TrackSource> = {
  camera: TrackSource.CAMERA, microphone: TrackSource.MICROPHONE,
  screen_share: TrackSource.SCREEN_SHARE, screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

export function livekitEnabled() {
  return livekitConfigured(process.env);
}

function config() {
  if (!livekitEnabled()) throw new Error("LiveKit isn't configured.");
  return { url: process.env.LIVEKIT_URL!.trim(), key: process.env.LIVEKIT_API_KEY!.trim(), secret: process.env.LIVEKIT_API_SECRET!.trim() };
}

/** A join token for one person in one class room. */
export async function videoToken(p: { room: string; userId: string; name: string; role: LiveRole; canSpeak?: boolean }) {
  const { url, key, secret } = config();
  const at = new AccessToken(key, secret, { identity: p.userId, name: p.name, metadata: participantMetadata(p.role), ttl: TOKEN_TTL_SEC });
  const g = grantFor(p.role, p.room, p.canSpeak);
  const grant: VideoGrant = { ...g, canPublishSources: g.canPublishSources.map((x) => SOURCE[x]) };
  at.addGrant(grant);
  return { url, token: await at.toJwt() };
}

function rooms() {
  const { url, key, secret } = config();
  // A short timeout so a slow or unreachable LiveKit never holds up the class page.
  return new RoomServiceClient(livekitApiHost(url), key, secret, { requestTimeout: 8 });
}

/**
 * Lets a student use their mic and camera, or takes it back. Taking it back
 * makes LiveKit unpublish their tracks straight away. Returns false if the
 * student isn't in the room right now (their next token carries the change).
 */
export async function setSpeaker(room: string, identity: string, on: boolean) {
  const p = speakerPermission(on);
  try {
    await rooms().updateParticipant(room, identity, { permission: { ...p, canPublishSources: p.canPublishSources.map((x) => SOURCE[x]) } });
    return true;
  } catch { return false; }
}

/** Mutes every student microphone in the room. Returns how many were muted, or null if LiveKit couldn't be reached. */
export async function muteStudents(room: string) {
  try {
    const svc = rooms();
    const people = await svc.listParticipants(room);
    let n = 0;
    for (const p of people) {
      for (const t of p.tracks) {
        if (!t.muted && isStudentMic(p, trackSourceToString(t.source))) { await svc.mutePublishedTrack(room, p.identity, t.sid, true); n++; }
      }
    }
    return n;
  } catch { return null; }
}

/** Closes the room when the class ends so nobody stays connected. Best effort. */
export async function closeRoom(room: string) {
  try { await rooms().deleteRoom(room); return true; } catch { return false; }
}
