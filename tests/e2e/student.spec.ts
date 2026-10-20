import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Educop!2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("dashboard shows points, streak and links to the new areas", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
  await expect(page.getByText("Puzzle solver")).toBeVisible();
  await expect(page.getByText("Five-day streak")).toBeVisible();
  await page.getByRole("link", { name: /Reasoning skills Puzzle practice/ }).click();
  await expect(page.getByRole("heading", { name: "Thinking skills activities" })).toBeVisible();
  await expect(page.getByText("not an IQ test")).toBeVisible();
  // Seeded history: friendly growth words, never scores against others.
  await expect(page.getByText("You're getting quicker at quick puzzles.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/percentile|IQ score:/i);
});

test("student finishes a reasoning practice set with a break in the middle", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.goto("/student/skills");
  await page.getByRole("link", { name: "Start Spatial practice" }).click();
  await page.getByRole("button", { name: "Start spatial practice" }).click();
  for (let i = 1; i <= 8; i++) {
    await expect(page.getByText(`Puzzle ${i} of 8`)).toBeVisible();
    if (i === 3) {
      await page.getByRole("button", { name: "Take a break" }).click();
      await expect(page.getByRole("heading", { name: "Taking a break" })).toBeVisible();
      await page.getByRole("button", { name: "Keep going" }).click();
    }
    await page.getByRole("group", { name: "Answer options" }).getByRole("button").first().click();
    await expect(page.getByText(/Nice thinking!|Good try\./)).toBeVisible();
    await page.getByRole("button", { name: i === 8 ? "See how I did" : "Next puzzle" }).click();
  }
  await expect(page.getByRole("heading", { name: "Practice saved" })).toBeVisible();
  await expect(page.getByText(/You solved \d of 8 puzzles/)).toBeVisible();
  await expect(page.getByText("+10 points for finishing")).toBeVisible();
  await page.getByRole("link", { name: "See my growth" }).click();
  await expect(page.locator("li", { hasText: "Spatial" }).getByText("Great start on shape puzzles")).toBeVisible();
});

test("growth: private check-in, reflection, goals and habits", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.goto("/student/growth");
  await page.getByRole("button", { name: "Who can see this?" }).click();
  const dialog = page.getByRole("dialog", { name: "Who can see my growth answers?" });
  await expect(dialog).toContainText("Other students");
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.locator('p[role="alert"]').first()).toContainText("Pick how you feel");
  await page.getByText("A bit low").click();
  await page.getByText("Worried", { exact: true }).click();
  await expect(page.getByLabel("Share with my teacher").first()).not.toBeChecked();
  await expect(page.getByLabel("Share with my parent").first()).not.toBeChecked();
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByText("Check-in saved.")).toBeVisible();
  await expect(page.getByText(/3-minute stretch break/)).toBeVisible();
  await page.getByRole("button", { name: "Ask for a check-in" }).click();
  await expect(page.getByText("Your teacher has been asked.")).toBeVisible();

  await page.getByLabel("Choose a scenario").selectOption("new-student");
  await page.getByLabel("Say hello and ask if they want to join your game").check();
  await page.getByLabel(/What would you do\?/).fill("I would invite them to play football with us.");
  await page.getByRole("button", { name: "Save my reflection" }).click();
  await expect(page.getByText("A small hello can make a big difference.")).toBeVisible();

  await page.getByLabel("New goal").fill("Read 10 pages every evening");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Mark done: Read 10 pages every evening" }).click();
  await expect(page.getByText("Goals I've reached (2)")).toBeVisible();

  const habit = page.getByLabel("I pack my bag the night before");
  await habit.check();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByLabel("I pack my bag the night before")).toBeChecked();
});

test("for you: evidence, mark done, points and badges", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.goto("/student/for-you");
  await expect(page.getByRole("heading", { name: "Recommended for Layla" })).toBeVisible();
  const before = Number(await page.getByTestId("points-total").textContent());
  const card = page.getByRole("article").first();
  await expect(card.getByText("Why am I seeing this?")).toBeVisible();
  await card.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByTestId("points-total")).toHaveText(String(before + 5));
  await expect(page.locator("li", { hasText: "Goal getter" })).toContainText("Earned");
  await expect(page.getByText("Last 14 days")).toBeVisible();
  await expect(page.getByText(/leaderboard/i)).toHaveCount(0);
});

test("study buddy: offline hints, safety screen and reporting a reply", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.goto("/student/buddy");
  await page.getByRole("button", { name: "How do I find equal fractions?" }).click();
  const chat = page.getByRole("list", { name: "Conversation" });
  // One hint is from yesterday's seeded chat; the new one is labelled as a template.
  await expect(chat.getByText(/^Hint 1: picture a strip/)).toHaveCount(2);
  await expect(chat.getByText("Template hint (AI not connected)")).toHaveCount(2);

  await page.getByLabel("Ask Nova a question").fill("kids at school keep bullying me");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText(/Being treated unkindly is never okay/)).toBeVisible();

  await chat.getByRole("button", { name: "This seems wrong" }).last().click();
  await chat.getByLabel("What seems wrong? (optional)").fill("It didn't answer my question");
  await chat.getByRole("button", { name: "Send report" }).click();
  await expect(chat.getByText("Reported. Thanks").first()).toBeVisible();
  await expect(page.getByText(/questions left today/)).toContainText("38 of 40");
});

test("a student from another school starts with their own empty practice history", async ({ page }) => {
  await login(page, "maya@palmgrove.example");
  await page.goto("/student/skills");
  await expect(page.getByText("0 sets finished")).toBeVisible();
  const res = await page.goto("/student/skills/not-a-skill");
  expect(res?.status()).toBe(404);
});
