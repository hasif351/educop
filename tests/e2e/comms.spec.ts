import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "Educop!2026";

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function as(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return page;
}

test("app shell: sidebar, bell with unread count and user menu", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Dashboard", "Virtual classroom", "Messages", "Notifications", "Settings & privacy"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /^Notifications, \d+ unread$/ })).toBeVisible();
  await page.getByRole("button", { name: "Account menu for Sara Mitchell" }).click();
  await page.getByRole("menuitem", { name: "Settings & privacy" }).click();
  await expect(page).toHaveURL(/\/teacher\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings & privacy" })).toBeVisible();
});

test("mobile: the nav opens as a drawer", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await login(page, "layla@crescentbay.example");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Live class" }).click();
  await expect(page).toHaveURL(/\/student\/live$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  for (const path of ["/student/live", "/student/notifications", "/student/settings?tab=privacy", "/student/settings?tab=accessibility"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375);
  }
  await ctx.close();
});

test("notifications: filter, mark read and mark all read", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.goto("/student/notifications");
  await expect(page.getByText("4 unread", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Unread", exact: true }).click();
  await expect(page.getByText("Feedback posted")).toHaveCount(0); // already read
  await page.getByRole("button", { name: "Mark read: School announcement" }).click();
  await expect(page.getByText("3 unread", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page.getByText("Live class later today")).toBeVisible();
  await expect(page.getByText("Assignment due soon")).toHaveCount(0);
  await page.getByRole("button", { name: "Open: Live class later today" }).click();
  await expect(page).toHaveURL(/\/student\/live$/);
  await page.goto("/student/notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Notifications", exact: true }).first()).toBeVisible();
});

test("publishing and marking work notifies students and parents", async ({ browser }) => {
  const sara = await as(browser, "sara.mitchell@crescentbay.example");
  await sara.goto("/teacher/assignments/new");
  await sara.getByLabel("Title").fill("Fractions notify check");
  await sara.getByLabel("Question 1", { exact: true }).fill("1/2 = ?/4");
  await sara.getByLabel("Option 1", { exact: true }).fill("2");
  await sara.getByLabel("Option 2", { exact: true }).fill("3");
  await sara.getByRole("button", { name: "Publish to class" }).click();
  await expect(sara.getByRole("heading", { name: "Fractions notify check" })).toBeVisible();

  const layla = await as(browser, "layla@crescentbay.example");
  await layla.goto("/student/notifications?filter=assign");
  await expect(layla.getByText("New assignment: Fractions notify check")).toBeVisible();
  const rania = await as(browser, "rania.hassan@example.com");
  await rania.goto("/parent/notifications");
  await expect(rania.getByText("New assignment: Fractions notify check")).toBeVisible();
});

test("settings: larger text applies, preferences and password", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.goto("/student/settings?tab=accessibility");
  const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(await size()).toBe("16px");
  await page.getByRole("switch", { name: /Larger text/ }).check();
  await page.getByRole("switch", { name: /Calm mode/ }).check();
  await page.getByRole("button", { name: "Save accessibility settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect.poll(size).toBe("18px");
  await page.reload();
  expect(await size()).toBe("18px");
  await expect(page.getByRole("switch", { name: /Larger text/ })).toBeChecked();
  await page.getByRole("switch", { name: /Larger text/ }).uncheck();
  await page.getByRole("button", { name: "Save accessibility settings" }).click();
  await expect.poll(size).toBe("16px");

  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabel("Time zone").selectOption("Europe/London");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/London");
  await expect(page.getByLabel("Email")).toBeDisabled();

  await page.goto("/student/settings?tab=security");
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("textbox", { name: /^New password/ }).fill("a much longer passphrase");
  await page.getByLabel("Confirm new password").fill("a different passphrase");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("don't match");
  await page.getByLabel("Current password").fill("wrong-password!");
  await page.getByRole("textbox", { name: /^New password/ }).fill("a much longer passphrase");
  await page.getByLabel("Confirm new password").fill("a much longer passphrase");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("current password isn't right");
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
  // Put it back for the other tests.
  await page.getByLabel("Current password").fill("a much longer passphrase");
  await page.getByRole("textbox", { name: /^New password/ }).fill(PASSWORD);
  await page.getByLabel("Confirm new password").fill(PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
});

test("privacy: parent sets a child's consent, student sees it read-only, data export and deletion request", async ({ browser }) => {
  const rania = await as(browser, "rania.hassan@example.com");
  await rania.goto("/parent/settings?tab=privacy");
  const sw = rania.getByRole("switch", { name: "AI study buddy for Adam Hassan" });
  await expect(sw).not.toBeChecked();
  await sw.check();
  await rania.reload();
  await expect(rania.getByRole("switch", { name: "AI study buddy for Adam Hassan" })).toBeChecked();
  await expect(rania.locator("tr", { hasText: "Adam Hassan" }).filter({ hasText: "AI study buddy" }).first()).toContainText("Granted");

  const res = await rania.request.get("/api/my-data");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const data = await res.json();
  expect(data.user.email).toBe("rania.hassan@example.com");
  expect(JSON.stringify(data)).not.toContain("passwordHash");

  await rania.locator("summary", { hasText: "Request account deletion" }).click();
  await rania.getByRole("button", { name: "Request account deletion" }).click();
  await expect(rania.locator('p[role="alert"]')).toContainText("Tick the box");
  await rania.getByLabel(/I understand the school will review/).check();
  await rania.getByRole("button", { name: "Request account deletion" }).click();
  await expect(rania.getByText(/Request sent/)).toBeVisible();

  const layla = await as(browser, "layla@crescentbay.example");
  await layla.goto("/student/settings?tab=privacy");
  await expect(layla.getByText("Managed by your parent or guardian")).toBeVisible();
  await expect(layla.getByRole("switch", { name: "AI study buddy" })).toBeDisabled();
  await expect(layla.getByRole("switch", { name: "AI study buddy" })).toBeChecked();
});

test("messages: parent and teacher talk about a child, contact details are held", async ({ browser }) => {
  const rania = await as(browser, "rania.hassan@example.com");
  await rania.goto("/parent/messages");
  await rania.getByRole("link", { name: /Sara Mitchell.*About Layla Hassan/ }).click();
  await expect(rania.getByRole("heading", { name: "Message Sara Mitchell" })).toBeVisible();
  await expect(rania.getByRole("list", { name: "Messages" })).toContainText("Fraction strips are a great way");
  await rania.getByLabel("Template").selectOption("Request a meeting");
  await expect(rania.getByRole("textbox", { name: /^Message/ })).toHaveValue(/could we find a time to meet about Layla/);
  await rania.getByRole("textbox", { name: /^Message/ }).fill("Thank you! We will practise with paper strips this weekend.");
  await rania.getByRole("button", { name: "Send" }).click();
  await expect(rania.getByRole("list", { name: "Messages" })).toContainText("paper strips this weekend");
  await rania.getByRole("textbox", { name: /^Message/ }).fill("Easier to call me on 050 123 4567.");
  await rania.getByRole("button", { name: "Send" }).click();
  await expect(rania.getByText(/^Held for review: your message/)).toBeVisible();
  await expect(rania.getByRole("list", { name: "Messages" }).locator("li", { hasText: "050 123 4567" })).toContainText("Held for review");

  // A parent can't open a conversation with a teacher who doesn't teach their child.
  const res = await rania.goto("/parent/messages?with=nobody&student=nobody");
  expect(res?.status()).toBe(404);

  const sara = await as(browser, "sara.mitchell@crescentbay.example");
  await expect(sara.getByRole("link", { name: /^Messages.*unread/ })).toBeVisible();
  await sara.goto("/teacher/messages");
  await sara.getByRole("link", { name: /Rania Hassan.*About Layla Hassan/ }).click();
  await expect(sara.getByRole("list", { name: "Messages" })).toContainText("paper strips this weekend");
  await expect(sara.getByText("050 123 4567")).toHaveCount(0);
  await sara.goto("/teacher/notifications?filter=message");
  await expect(sara.getByText("New message from Rania Hassan").first()).toBeVisible();
});

test("virtual classroom: schedule, start, join, hands, chat, polls, end and report", async ({ browser }) => {
  const sara = await as(browser, "sara.mitchell@crescentbay.example");
  await sara.goto("/teacher/live");
  await sara.getByLabel("Title").fill("Fractions on a number line (live)");
  await sara.getByRole("button", { name: "Schedule class" }).click();
  await expect(sara.getByText("Class scheduled.")).toBeVisible();
  await expect(sara.getByRole("link", { name: "Fractions on a number line (live)" })).toBeVisible();
  await expect(sara.locator("tr", { hasText: "Comparing fractions" })).toContainText("6/8");

  // Layla waits on the scheduled class, then it goes live.
  const layla = await as(browser, "layla@crescentbay.example");
  await layla.goto("/student/live");
  await layla.locator("li", { hasText: "Equivalent fractions" }).getByRole("link", { name: "Open" }).click();
  await expect(layla.getByText("Your teacher hasn't started the class yet.")).toBeVisible({ timeout: 15_000 });

  await sara.goto("/teacher/live");
  await sara.locator("li", { hasText: "Equivalent fractions" }).getByRole("button", { name: "Start class" }).click();
  await sara.waitForURL(/\/teacher\/live\/[^/]+$/, { timeout: 15_000 });
  const liveUrl = sara.url();
  await expect(sara.locator('iframe[src^="https://meet.jit.si/educop-"]')).toHaveCount(1);
  const head = await sara.request.get(liveUrl);
  expect(head.headers()["permissions-policy"]).toContain('camera=(self "https://meet.jit.si")');
  expect((await sara.request.get("/teacher/live")).headers()["permissions-policy"]).toContain("camera=()");

  await layla.getByRole("button", { name: "Join class" }).click({ timeout: 15_000 });
  await expect(layla.locator('iframe[src^="https://meet.jit.si/educop-"]')).toHaveCount(1);
  await layla.getByRole("button", { name: "Raise hand" }).click();
  await expect(layla.getByRole("button", { name: "Lower hand" })).toBeVisible();
  await layla.getByLabel("Message the class").fill("Is 2/4 the same as 1/2?");
  await layla.getByRole("button", { name: "Send" }).click();
  await expect(layla.getByRole("list", { name: "Class chat" })).toContainText("Is 2/4 the same as 1/2?");
  await layla.getByLabel("Message the class").fill("my number is 050 123 4567");
  await layla.getByRole("button", { name: "Send" }).click();
  await expect(layla.getByRole("list", { name: "Class chat" }).getByText("Held for review")).toBeVisible();
  const laylaStudentLink = layla.url();

  // Teacher sees the hand (after a poll tick), approves nothing, runs a poll.
  await expect(sara.getByRole("button", { name: /People \(1 ✋\)/ })).toBeVisible({ timeout: 12_000 });
  await sara.getByRole("button", { name: "Lower" }).click();
  await sara.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(sara.getByRole("list", { name: "Class chat" })).toContainText("Is 2/4 the same as 1/2?");
  await expect(sara.getByRole("list", { name: "Class chat" })).toContainText("050 123 4567");
  await sara.getByRole("button", { name: "Remove" }).click();
  await expect(sara.getByRole("list", { name: "Class chat" })).not.toContainText("050 123 4567");
  await sara.getByRole("button", { name: /^Poll/ }).click();
  await sara.getByRole("button", { name: "Is 2/4 the same as 1/2?" }).click();
  await sara.getByRole("button", { name: "Start poll" }).click();
  await expect(sara.getByText("0 responses")).toBeVisible();

  await layla.getByRole("button", { name: /^Poll/ }).click();
  await layla.getByRole("button", { name: "Yes" }).click({ timeout: 12_000 });
  await expect(layla.getByRole("button", { name: "✓ Yes" })).toBeVisible();
  await expect(sara.getByText("1 response", { exact: true })).toBeVisible({ timeout: 12_000 });

  // Other schools and non-enrolled students can't open it.
  const omar = await as(browser, "omar.farouk@palmgrove.example");
  expect((await omar.goto(liveUrl))?.status()).toBe(404);
  const adam = await as(browser, "adam@crescentbay.example");
  expect((await adam.goto(laylaStudentLink))?.status()).toBe(404);

  sara.once("dialog", (d) => d.accept());
  await sara.getByRole("button", { name: "End class" }).click();
  await expect(sara.getByRole("heading", { name: "Class summary: Equivalent fractions" })).toBeVisible();
  await expect(sara.locator("tr", { hasText: "Layla Hassan" })).toContainText("Present");
  await expect(sara.locator("tr", { hasText: "Ethan Brooks" })).toContainText("Absent");
  await expect(layla.getByText("You were there")).toBeVisible({ timeout: 12_000 });

  await layla.goto("/student/notifications");
  await expect(layla.getByText("Live class has started: Equivalent fractions")).toBeVisible();
});
