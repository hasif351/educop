import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import {
  TOKEN_TTL_SEC, grantFor, isStudentMic, livekitApiHost, livekitConfigured, mayGetToken, participantMetadata,
  recordingFileName, recordingSource, roleFromMetadata, speakerPermission,
} from "@/lib/livekit-utils";
import { PROVIDER_LABEL, videoFor } from "@/lib/live-utils";

vi.mock("server-only", () => ({}));

// Fictional test credentials: never a real LiveKit project.
const KEY = "APItestkey123";
const SECRET = "test-secret-that-is-long-enough-for-hs256-0123456789";

describe("Educop live: who may do what", () => {
  it("is offered only with all three LiveKit settings and a WebSocket URL", () => {
    const ok = { LIVEKIT_URL: "wss://demo-school.livekit.cloud", LIVEKIT_API_KEY: KEY, LIVEKIT_API_SECRET: SECRET };
    expect(livekitConfigured(ok)).toBe(true);
    expect(livekitConfigured({ ...ok, LIVEKIT_URL: "ws://127.0.0.1:7880" })).toBe(true);
    expect(livekitConfigured({ ...ok, LIVEKIT_URL: "https://demo-school.livekit.cloud" })).toBe(false);
    expect(livekitConfigured({ ...ok, LIVEKIT_API_KEY: "" })).toBe(false);
    expect(livekitConfigured({ ...ok, LIVEKIT_API_SECRET: undefined })).toBe(false);
    expect(livekitConfigured({})).toBe(false);
  });

  it("gives the teacher camera, mic, screen share and room admin", () => {
    const g = grantFor("TEACHER", "educop-room");
    expect(g).toMatchObject({ room: "educop-room", roomJoin: true, roomAdmin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    expect(g.canPublishSources).toEqual(expect.arrayContaining(["camera", "microphone", "screen_share"]));
  });

  it("lets students watch and listen, and speak only when invited (never screen share)", () => {
    expect(grantFor("STUDENT", "r")).toMatchObject({ roomAdmin: false, canPublish: false, canSubscribe: true, canPublishData: true, canPublishSources: [] });
    const invited = grantFor("STUDENT", "r", true);
    expect(invited).toMatchObject({ roomAdmin: false, canPublish: true });
    expect(invited.canPublishSources.sort()).toEqual(["camera", "microphone"]);
    expect(speakerPermission(false)).toMatchObject({ canPublish: false, canPublishSources: [], canSubscribe: true });
  });

  it("issues tokens only while live, and to students only after they join", () => {
    expect(mayGetToken({ role: "TEACHER", status: "LIVE", joined: false })).toBe(true);
    expect(mayGetToken({ role: "TEACHER", status: "SCHEDULED", joined: false })).toBe(false);
    expect(mayGetToken({ role: "TEACHER", status: "ENDED", joined: false })).toBe(false);
    expect(mayGetToken({ role: "STUDENT", status: "LIVE", joined: true })).toBe(true);
    expect(mayGetToken({ role: "STUDENT", status: "LIVE", joined: false })).toBe(false);
    expect(mayGetToken({ role: "STUDENT", status: "SCHEDULED", joined: true })).toBe(false);
  });

  it("tells the teacher apart by metadata and finds student mics", () => {
    expect(roleFromMetadata(participantMetadata("TEACHER"))).toBe("teacher");
    expect(roleFromMetadata(participantMetadata("STUDENT"))).toBe("student");
    expect(roleFromMetadata("not json")).toBe("student");
    expect(isStudentMic({ metadata: participantMetadata("STUDENT") }, "microphone")).toBe(true);
    expect(isStudentMic({ metadata: participantMetadata("TEACHER") }, "microphone")).toBe(false);
    expect(isStudentMic({ metadata: participantMetadata("STUDENT") }, "camera")).toBe(false);
  });

  it("records the screen share if any, else the camera", () => {
    expect(recordingSource({ screen: "s", camera: "c" })).toEqual({ kind: "screen", track: "s" });
    expect(recordingSource({ screen: null, camera: "c" })).toEqual({ kind: "camera", track: "c" });
    expect(recordingSource({ screen: undefined, camera: null })).toBeNull();
    const name = recordingFileName("Fractions: part 2!", new Date("2026-10-21T09:05:00Z"));
    expect(name).toBe("live-Fractions-part-2-2026-10-21-09-05.webm");
    expect(`recordings/${name}`).toMatch(/^recordings\/[\w .()-]{1,120}\.(mp4|webm|mov)$/i); // the upload route's rule
  });

  it("maps the WebSocket URL to the API host", () => {
    expect(livekitApiHost("wss://demo-school.livekit.cloud/")).toBe("https://demo-school.livekit.cloud");
    expect(livekitApiHost("ws://127.0.0.1:7880")).toBe("http://127.0.0.1:7880");
  });

  it("labels and routes the provider", () => {
    expect(PROVIDER_LABEL.educop).toBe("Educop live (beta)");
    expect(videoFor({ provider: "educop", meetingUrl: null, roomName: "educop-x" }, "Sara")).toEqual({ provider: "educop", url: "" });
  });
});

describe("Educop live: signed tokens", () => {
  beforeEach(() => {
    vi.stubEnv("LIVEKIT_URL", "wss://demo-school.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", KEY);
    vi.stubEnv("LIVEKIT_API_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  const verify = (jwt: string) => new TokenVerifier(KEY, SECRET).verify(jwt);

  it("teacher token: identity, name, role, 2 hour expiry and full publish rights", async () => {
    const { videoToken } = await import("@/lib/livekit");
    const { url, token } = await videoToken({ room: "educop-abc", userId: "u_teacher", name: "Sara Mitchell", role: "TEACHER" });
    expect(url).toBe("wss://demo-school.livekit.cloud");
    const c = await verify(token);
    expect(c.sub).toBe("u_teacher");
    expect(c.name).toBe("Sara Mitchell");
    expect(JSON.parse(c.metadata!)).toEqual({ role: "teacher" });
    expect(c.exp! - c.nbf!).toBe(TOKEN_TTL_SEC);
    expect(c.video).toMatchObject({ room: "educop-abc", roomJoin: true, roomAdmin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    expect(c.video!.canPublishSources).toEqual(expect.arrayContaining(["camera", "microphone", "screen_share"]));
  });

  it("student token: subscribe and data only, unless invited to speak", async () => {
    const { videoToken } = await import("@/lib/livekit");
    const plain = await verify((await videoToken({ room: "educop-abc", userId: "u_student", name: "Layla H.", role: "STUDENT" })).token);
    expect(plain.sub).toBe("u_student");
    expect(JSON.parse(plain.metadata!)).toEqual({ role: "student" });
    expect(plain.video).toMatchObject({ room: "educop-abc", roomJoin: true, canSubscribe: true, canPublishData: true, canPublish: false });
    expect(plain.video!.roomAdmin).toBeFalsy();
    expect(plain.video!.canPublishSources ?? []).toEqual([]);

    const invited = await verify((await videoToken({ room: "educop-abc", userId: "u_student", name: "Layla H.", role: "STUDENT", canSpeak: true })).token);
    expect(invited.video).toMatchObject({ canPublish: true });
    expect([...(invited.video!.canPublishSources as unknown as string[])].sort()).toEqual(["camera", "microphone"]);
  });

  it("a token signed with another secret doesn't verify", async () => {
    const { videoToken } = await import("@/lib/livekit");
    const { token } = await videoToken({ room: "r", userId: "u", name: "n", role: "STUDENT" });
    await expect(new TokenVerifier(KEY, "a-different-secret-that-is-long-enough-0123456789").verify(token)).rejects.toThrow();
  });

  it("refuses to issue tokens without settings", async () => {
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    const { videoToken, livekitEnabled } = await import("@/lib/livekit");
    expect(livekitEnabled()).toBe(false);
    await expect(videoToken({ room: "r", userId: "u", name: "n", role: "TEACHER" })).rejects.toThrow("LiveKit isn't configured.");
  });
});
