import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "Educop!2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function as(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return page;
}

test("recorded class: teacher publishes, student answers the in-video question and resumes", async ({ browser }) => {
  const sara = await as(browser, "sara.mitchell@crescentbay.example");
  await sara.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recorded classes" }).click();
  await expect(sara.getByRole("heading", { name: "Recorded classes", level: 1 })).toBeVisible();
  // The seeded demo recording, with the class's progress.
  await expect(sara.getByRole("link", { name: "Equivalent fractions (recorded lesson)" })).toBeVisible();

  await sara.getByRole("link", { name: "New recording" }).click();
  await expect(sara.getByText("Video upload needs storage to be connected (Vercel Blob); for now paste a video link.")).toBeVisible();
  await sara.getByLabel("Title", { exact: true }).fill("Fractions recap e2e");
  // Pages aren't playable files.
  await sara.getByLabel("Video link").fill("https://www.youtube.com/watch?v=abc");
  await expect(sara.getByText(/That's a video page, not a video file/)).toBeVisible();
  await sara.getByLabel("Video link").fill("/media/equivalent-fractions.mp4");
  await expect(sara.getByText("Video found · 1:12 long.")).toBeVisible();
  await sara.getByLabel("Captions or transcript").fill("00:00 Hello 5B\n00:05 Equivalent fractions show the same amount");
  await sara.getByRole("button", { name: "+ Add chapter" }).click();
  await sara.getByLabel("Chapter 2 time").fill("0:10");
  await sara.getByLabel("Chapter 2 title").fill("Same amount");
  await sara.getByRole("button", { name: "+ Add question" }).click();
  await sara.getByLabel("Question 1 time").fill("0:02");
  await sara.getByLabel("Question 1", { exact: true }).fill("Which is equal to 1/2?");
  await sara.getByLabel("Question 1 option 1", { exact: true }).fill("2/4");
  await sara.getByLabel("Question 1 option 2", { exact: true }).fill("1/3");
  await sara.getByLabel("Question 1 explanation").fill("Double the top and the bottom.");
  await sara.getByRole("button", { name: "Publish to class" }).click();
  await expect(sara.getByRole("heading", { name: "Fractions recap e2e" })).toBeVisible();
  await expect(sara.getByText("Published", { exact: true })).toBeVisible();
  await expect(sara.getByRole("region", { name: "Video player: Fractions recap e2e" })).toBeVisible();
  const recUrl = sara.url();

  const layla = await as(browser, "layla@crescentbay.example");
  await layla.goto("/student/notifications");
  await expect(layla.getByText("New recorded class: Fractions recap e2e")).toBeVisible();
  await layla.goto("/student/recordings");
  await layla.getByRole("link", { name: "Fractions recap e2e" }).click();
  const player = layla.getByRole("region", { name: "Video player: Fractions recap e2e" });
  const seek = player.getByRole("slider", { name: "Seek" });
  await expect(seek).toHaveAttribute("aria-valuemax", "72");
  await expect(layla.getByRole("tab", { name: "Chapters" })).toBeVisible();
  await layla.getByRole("tab", { name: "Transcript" }).click();
  await expect(layla.getByRole("button", { name: /Equivalent fractions show the same amount/ })).toBeVisible();

  // Skipping ahead stops at the unanswered question.
  await player.getByRole("button", { name: "Forward 10 seconds" }).click();
  const question = player.getByRole("dialog", { name: "Which is equal to 1/2?" });
  await expect(question).toBeVisible();
  await expect(seek).toHaveAttribute("aria-valuenow", "2");
  await question.getByRole("button", { name: "1/3" }).click();
  await expect(question.getByText("Not quite.")).toBeVisible();
  await question.getByRole("button", { name: "Try again" }).click();
  await question.getByRole("button", { name: "2/4" }).click();
  await expect(question.getByText("Correct!")).toBeVisible();
  await expect(question.getByText("Double the top and the bottom.")).toBeVisible();
  await question.getByRole("button", { name: "Continue" }).click();
  await expect(question).toHaveCount(0);

  // Plays on (the player controls only), then pausing saves progress.
  await expect(seek).toHaveAttribute("aria-valuenow", /^([6-9]|[1-9]\d)$/, { timeout: 20_000 });
  await player.getByRole("button", { name: "Pause" }).click();
  await expect(player.getByText("Progress saved")).toBeVisible();
  await expect(player.getByText(/Watched [1-9]\d?%/)).toBeVisible();

  await layla.reload();
  await expect(layla.getByText(/Resumed at 0:(0[3-9]|[1-5]\d)/)).toBeVisible();
  await expect(layla.getByRole("slider", { name: "Seek" })).not.toHaveAttribute("aria-valuenow", "0");
  await expect(layla.getByText(/Watched [1-9]\d?%/)).toBeVisible();
  // Keyboard: K plays and pauses, C toggles captions, and the help lists the shortcuts.
  await player.getByRole("slider", { name: "Seek" }).focus();
  await layla.keyboard.press("k");
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible();
  await layla.keyboard.press("k");
  await expect(player.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(player.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "true");
  await layla.keyboard.press("c");
  await expect(player.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "false");
  await player.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(player.getByText("Back or forward 10 seconds")).toBeVisible();

  // The teacher sees the result in the analytics.
  await sara.goto(recUrl);
  await expect(sara.locator("tr", { hasText: "Layla Hassan" })).toContainText("Right (2 tries)");
  await expect(sara.getByText("Where students stop watching")).toBeVisible();

  // Other schools, and students outside the class, get a 404.
  const omar = await as(browser, "omar.farouk@palmgrove.example");
  expect((await omar.goto(recUrl))?.status()).toBe(404);
  const adam = await as(browser, "adam@crescentbay.example");
  expect((await adam.goto(recUrl.replace("/teacher/", "/student/")))?.status()).toBe(404);
});

test("recorded class: an ended live class links to adding its recording", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/live");
  await page.getByRole("link", { name: "Attendance report" }).first().click();
  await page.getByRole("link", { name: "Add the class recording" }).click();
  await expect(page).toHaveURL(/\/teacher\/recordings\/new\?live=/);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(/^Recording: /);
  await expect(page.getByText(/Download it from Teams or Meet/)).toBeVisible();
});

test("recorded class: the parent sees the child's recorded-class progress", async ({ page }) => {
  await login(page, "rania.hassan@example.com");
  await page.getByRole("link", { name: /Layla Hassan/ }).click();
  await expect(page.getByRole("heading", { name: "Layla's overview" })).toBeVisible();
  await expect(page.getByText(/Recorded classes: watched \d+ of \d+, \d+ completed\./)).toBeVisible();
});
