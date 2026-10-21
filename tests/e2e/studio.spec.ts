import { expect, test, type Page } from "@playwright/test";

// Fake camera, microphone and screen, accepted without a prompt.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--auto-accept-this-tab-capture"] },
  permissions: ["camera", "microphone"],
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill("Educop!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Share of non-white pixels in a box of the studio canvas (0..1). */
async function ink(page: Page, x: number, y: number, w: number, h: number) {
  return page.locator("canvas[aria-label^='Studio view']").evaluate((c: HTMLCanvasElement, [x, y, w, h]) => {
    const d = c.getContext("2d")!.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) n++;
    return n / (w * h);
  }, [x, y, w, h]);
}

test("recording studio: whiteboard writing, screen share, camera and a recording with chapters", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/recordings");
  await page.getByRole("link", { name: "Record in studio" }).click();
  await expect(page.getByRole("heading", { name: "Recording studio", level: 1 })).toBeVisible();

  // Write on the whiteboard, undo it, write again.
  const canvas = page.locator("canvas[aria-label^='Studio view']");
  const scribble = async () => {
    // Clicking buttons can scroll the page, so measure the canvas each time.
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;
    await page.mouse.move(...at(0.3, 0.4));
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(...at(0.3 + i * 0.02, 0.4 + (i % 2) * 0.05));
    await page.mouse.up();
  };
  await scribble();
  await expect.poll(() => ink(page, 380, 280, 260, 50)).toBeGreaterThan(0.01);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => ink(page, 380, 280, 260, 50)).toBe(0);
  await scribble();
  await expect.poll(() => ink(page, 380, 280, 260, 50)).toBeGreaterThan(0.01);

  // Mic and camera; the face bubble shows over the whiteboard.
  await page.getByRole("button", { name: "Mic off" }).click();
  await expect(page.getByRole("button", { name: /Mic on/ })).toBeVisible();
  await page.getByRole("button", { name: "Camera off" }).click();
  await expect(page.getByRole("button", { name: "Camera on" })).toBeVisible();
  await expect.poll(() => ink(page, 1070, 510, 160, 160)).toBeGreaterThan(0.3);

  await page.getByLabel("Recording title").fill("Fractions studio e2e");
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible({ timeout: 6000 });

  // Switch views while recording: a new board page, the screen, the camera.
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "+ New page" }).click();
  await expect(page.getByRole("button", { name: "Board 2" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => ink(page, 380, 280, 260, 50)).toBe(0);
  await scribble();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(page.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Board 1" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop recording" }).click();

  // Review: a playable preview, chapters from the view switches, and download
  // (video storage isn't connected in tests).
  const preview = page.getByLabel("Recording preview");
  await expect(preview).toBeVisible();
  const chapters = page.getByRole("list", { name: "Chapters" });
  await expect(chapters.getByRole("listitem")).toHaveText([/0:00\s+Whiteboard/, /Whiteboard 2/, /Screen share/, /Whiteboard 2$/]);
  await expect(page.getByText("Video storage isn't connected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("download", /^studio-Fractions-studio-e2e-.*\.webm$/);
  const size = await preview.evaluate(async (v: HTMLVideoElement) => (await (await fetch(v.src)).blob()).size);
  expect(size).toBeGreaterThan(20_000);
});

test("studio upload opens the recording form with its title and chapters", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  const video = "https://abc123.public.blob.vercel-storage.com/recordings/studio-x.webm";
  const q = new URLSearchParams({ studio: "1", video, duration: "125", title: "Fractions studio", chapters: JSON.stringify([[0, "Whiteboard"], [64, "Screen share"]]) });
  await page.goto(`/teacher/recordings/new?${q}`);
  await expect(page.getByText("Your studio recording is uploaded.")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Fractions studio");
  await expect(page.getByLabel("Chapter 2 time")).toHaveValue("1:04");
  await expect(page.getByLabel("Chapter 2 title")).toHaveValue("Screen share");
  // Only our own storage counts as a studio upload.
  await page.goto(`/teacher/recordings/new?studio=1&video=${encodeURIComponent("https://evil.example/a.webm")}&title=x`);
  await expect(page.getByText("Your studio recording is uploaded.")).toHaveCount(0);
});
