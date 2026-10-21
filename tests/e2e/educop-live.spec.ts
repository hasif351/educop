import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

// Educop live (beta) with fake LiveKit settings (see playwright.config.ts): no
// LiveKit server runs here, so the video can't connect. This checks scheduling,
// the stage's failure handling, attendance, and who gets a token when.

const PASSWORD = "Educop!2026";

async function as(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

const token = (r: APIRequestContext, id: string) => r.post(`/api/live/${id}/token`);
function grants(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as { sub: string; video: Record<string, unknown> };
}

test("Educop live: schedule, start with a failed connection, join, invite to speak and token rules", async ({ browser }) => {
  test.setTimeout(120_000);
  const sara = await as(browser, "sara.mitchell@crescentbay.example");
  await sara.goto("/teacher/live");
  // Configured, so it's the default and selectable.
  await expect(sara.getByLabel("Video")).toHaveValue("educop");
  await expect(sara.getByRole("option", { name: "Educop live (beta)" })).toBeEnabled();
  await sara.getByLabel("Title").fill("Number bonds (Educop live)");
  await sara.getByRole("button", { name: "Schedule class" }).click();
  await expect(sara.getByText("Class scheduled.")).toBeVisible();
  const row = sara.locator("li", { hasText: "Number bonds (Educop live)" });
  await expect(row).toContainText("Educop live (beta)");
  const href = await row.getByRole("link", { name: "Number bonds (Educop live)" }).getAttribute("href");
  const id = href!.split("/").pop()!;

  // Not live yet: nobody gets a token.
  const layla = await as(browser, "layla@crescentbay.example");
  const adam = await as(browser, "adam@crescentbay.example");
  const omar = await as(browser, "omar.farouk@palmgrove.example");
  for (const p of [sara, layla]) {
    const r = await token(p.request, id);
    expect(r.status()).toBe(409);
    expect((await r.json()).token).toBeUndefined();
  }
  expect((await token(adam.request, id)).status()).toBe(404); // not in the class
  expect((await token(omar.request, id)).status()).toBe(404); // another school

  // Start: the stage shows, can't reach the (fake) video service, and says so.
  await row.getByRole("button", { name: "Start class" }).click();
  await sara.waitForURL(new RegExp(`/teacher/live/${id}$`), { timeout: 15_000 });
  const stage = sara.getByRole("region", { name: "Live video" });
  await expect(stage).toBeVisible();
  await expect(stage.getByText("Couldn't connect to the live video service")).toBeVisible({ timeout: 30_000 });
  await expect(stage.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(sara.getByRole("button", { name: "End class" })).toBeEnabled();
  expect((await sara.request.get(`/teacher/live/${id}`)).headers()["permissions-policy"]).toMatch(/camera=\(self[^)]*\).*autoplay=\(self/);

  const t = await token(sara.request, id);
  expect(t.status()).toBe(200);
  const tb = await t.json();
  expect(tb.url).toBe("ws://127.0.0.1:7881");
  expect(JSON.stringify(tb)).not.toContain("e2e-fake-secret");
  expect(grants(tb.token).video).toMatchObject({ roomJoin: true, roomAdmin: true, canPublish: true });

  // A student gets a token only after "Join class" records attendance.
  await layla.goto(`/student/live/${id}`);
  expect((await token(layla.request, id)).status()).toBe(409);
  await layla.getByRole("button", { name: "Join class" }).click({ timeout: 15_000 });
  await expect(layla.getByRole("region", { name: "Live video" })).toBeVisible();
  await expect(layla.getByText("Couldn't connect to the live video service")).toBeVisible({ timeout: 30_000 });
  await expect(layla.getByRole("button", { name: "Raise hand" })).toBeVisible();
  const lt = await token(layla.request, id);
  expect(lt.status()).toBe(200);
  const lg = grants((await lt.json()).token);
  expect(lg.video).toMatchObject({ canSubscribe: true, canPublishData: true, canPublish: false });
  expect(lg.video.roomAdmin).toBeFalsy();
  expect((await token(adam.request, id)).status()).toBe(404);
  expect((await token(omar.request, id)).status()).toBe(404);

  // Teacher sees Layla here and invites her to speak; her next token can publish.
  await expect(sara.locator("li", { hasText: "Layla Hassan" })).toContainText("Here", { timeout: 12_000 });
  await sara.getByRole("button", { name: "Invite Layla Hassan to speak" }).click();
  await expect(sara.getByText("Saved. It applies when their video reconnects.")).toBeVisible();
  await expect(sara.getByRole("button", { name: "Stop Layla Hassan speaking" })).toBeVisible();
  expect(grants((await (await token(layla.request, id)).json()).token).video).toMatchObject({ canPublish: true });
  await sara.getByRole("button", { name: "Stop Layla Hassan speaking" }).click();
  await expect(sara.getByRole("button", { name: "Invite Layla Hassan to speak" })).toBeVisible();
  expect(grants((await (await token(layla.request, id)).json()).token).video).toMatchObject({ canPublish: false });

  sara.once("dialog", (d) => d.accept());
  await sara.getByRole("button", { name: "End class" }).click();
  await expect(sara.getByRole("heading", { name: "Class summary: Number bonds (Educop live)" })).toBeVisible();
  await expect(sara.locator("tr", { hasText: "Layla Hassan" })).toContainText("Present");
  for (const p of [sara, layla]) expect((await token(p.request, id)).status()).toBe(409);
});

test("Educop live: a recording from the class opens the recording form prefilled as a draft", async ({ browser }) => {
  const sara = await as(browser, "sara.mitchell@crescentbay.example");
  await sara.goto("/teacher/live");
  await sara.getByLabel("Title").fill("Shapes (Educop live)");
  await sara.getByRole("button", { name: "Schedule class" }).click();
  const row = sara.locator("li", { hasText: "Shapes (Educop live)" });
  await row.getByRole("button", { name: "Start class" }).click();
  await sara.waitForURL(/\/teacher\/live\/[^/]+$/, { timeout: 15_000 });
  const id = sara.url().split("/").pop()!;
  // What the Record button opens after uploading to Vercel Blob (fictional file).
  const video = "https://abc123.public.blob.vercel-storage.com/recordings/live-Shapes-2026-10-21-09-00-x1y2.webm";
  await sara.goto(`/teacher/recordings/new?live=${id}&video=${encodeURIComponent(video)}&duration=754`);
  await expect(sara.getByText(/Your recording of “Shapes \(Educop live\)” is uploaded/)).toBeVisible();
  await expect(sara.getByLabel("Title", { exact: true })).toHaveValue("Recording: Shapes (Educop live)");
  await expect(sara.getByLabel("Video link")).toHaveValue(video);
  await expect(sara.getByRole("button", { name: "Save draft" })).toBeVisible();
  // Only uploaded files are prefilled, never an arbitrary link.
  await sara.goto(`/teacher/recordings/new?live=${id}&video=${encodeURIComponent("https://example.com/x.mp4")}`);
  await expect(sara.getByLabel("Video link")).toHaveValue("");
  sara.once("dialog", (d) => d.accept());
  await sara.goto(`/teacher/live/${id}`);
  await sara.getByRole("button", { name: "End class" }).click();
  await expect(sara.getByRole("heading", { name: "Class summary: Shapes (Educop live)" })).toBeVisible();
});
