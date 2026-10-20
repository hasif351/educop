import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Educop!2026";

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("wrong password shows a clear error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("School email").fill("layla@crescentbay.example");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("don't match");
});

test("each role lands on its own dashboard and can't open another's", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole("heading", { name: /Layla/ })).toBeVisible();
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/student$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login\?next=%2Fstudent/);
});

test("student works through a lesson and submits an assignment", async ({ page }) => {
  await login(page, "layla@crescentbay.example");
  await page.getByRole("link", { name: "Continue" }).first().click();
  await expect(page.getByRole("heading", { name: "Equivalent fractions", level: 1 })).toBeVisible();
  // Resumes at step 3 (steps 1–2 were done in the seed); finish the other six.
  const steps = page.getByRole("navigation", { name: "Lesson steps" });
  for (const pct of [38, 50, 63, 75, 88, 100]) {
    if (await page.getByRole("heading", { name: "Quick check" }).isVisible()) {
      await page.getByRole("button", { name: "3/6" }).click();
      await expect(page.getByText(/^Correct\./)).toBeVisible();
    }
    await page.getByRole("button", { name: /Mark done|Finish lesson/ }).click();
    await expect(steps.getByText(`${pct}%`)).toBeVisible();
  }

  await page.goto("/student/assignments");
  await page.getByRole("link", { name: "Equivalent fractions check-in" }).click();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Answer all questions");
  await page.getByLabel("3/6", { exact: true }).check();
  await page.getByLabel("6", { exact: true }).check();
  await page.locator("fieldset").nth(2).getByLabel("3/4", { exact: true }).check();
  await page.locator("fieldset").nth(3).getByLabel("2/3", { exact: true }).check();
  await page.getByRole("textbox").fill("6/10 and 9/15, because I multiplied the top and bottom by 2 and by 3.");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("Submitted. Your multiple-choice answers are marked")).toBeVisible();
  await expect(page.getByText(/being marked/)).toBeVisible();
});

test("teacher marks the short answer and the student gets a result and suggestion", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.locator("li", { hasText: "Layla Hassan" }).filter({ hasText: "Equivalent fractions check-in" }).getByRole("link", { name: "Mark" }).click();
  await page.getByRole("spinbutton").fill("2");
  await page.getByLabel("Feedback for the student").fill("Lovely method. Try one with denominators over 20 next.");
  await page.getByRole("button", { name: "Save marks & feedback" }).click();
  await expect(page.getByText("Marks saved")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Layla Hassan" })).toContainText("6/6");
  // 100% creates a stretch suggestion that waits for this teacher's approval.
  await page.goto("/teacher");
  const card = page.locator("li", { hasText: "Layla Hassan" }).filter({ hasText: "Challenge task" });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toHaveCount(0);

  await signOut(page);
  await login(page, "layla@crescentbay.example");
  await expect(page.getByText("Challenge task: Equivalent fractions")).toBeVisible();
  await expect(page.locator("li", { hasText: "Equivalent fractions check-in" }).getByText("6/6", { exact: true })).toBeVisible();
});

test("teacher builds and publishes a lesson and an assignment", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/lessons/new");
  await page.getByLabel("Title").fill("Adding fractions");
  await page.getByLabel(/Learning objectives/).fill("I can add fractions with the same denominator.");
  await page.getByLabel(/Introduction/).fill("Two slices plus one slice of the same pizza.");
  await page.getByRole("button", { name: "Save & publish" }).click();
  await expect(page.getByText("Lesson saved.")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Adding fractions" })).toContainText("Published");

  await page.goto("/teacher/assignments/new");
  await page.getByLabel("Title").fill("Adding fractions exit ticket");
  await page.getByRole("button", { name: "Publish to class" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("prompt");
  await page.getByLabel("Question 1", { exact: true }).fill("1/5 + 2/5 = ?");
  await page.getByLabel("Option 1", { exact: true }).fill("3/10");
  await page.getByLabel("Option 2", { exact: true }).fill("3/5");
  await page.getByLabel("Option 2 is correct").check();
  await page.getByRole("button", { name: "Publish to class" }).click();
  await expect(page.getByRole("heading", { name: "Adding fractions exit ticket" })).toBeVisible();
  await expect(page.getByText("Published")).toBeVisible();
});

test("schools are isolated from each other", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/assignments");
  await page.getByRole("link", { name: "Comparing fractions quiz" }).click();
  await page.waitForURL(/\/teacher\/assignments\/[^/]+$/);
  const crescentUrl = page.url();
  await signOut(page);

  await login(page, "omar.farouk@palmgrove.example");
  await expect(page.getByText("6A Mathematics").first()).toBeVisible();
  await expect(page.getByText("Comparing fractions quiz")).toHaveCount(0);
  const res = await page.goto(crescentUrl);
  expect(res?.status()).toBe(404);
  await page.getByRole("link", { name: "Go to my dashboard" }).waitFor();
});

test("parent sees only their own children", async ({ page }) => {
  await login(page, "rania.hassan@example.com");
  await expect(page.getByRole("heading", { name: "Layla Hassan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adam Hassan" })).toBeVisible();
  await expect(page.getByText("Ethan Brooks")).toHaveCount(0);
});

test("platform admin sees both schools", async ({ page }) => {
  await login(page, "platform@educop.example");
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByText("Crescent Bay International School")).toBeVisible();
  await expect(page.getByText("Palm Grove Academy")).toBeVisible();
});
