import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const PASSWORD = "Educop!2026";
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("dashboard links to AI drafts, recommendations and progress", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await expect(page.getByRole("heading", { name: "AI drafts awaiting you" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lesson plan: Fractions on a number line/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Objectives needing attention" })).toBeVisible();
  await expect(page.getByText("G5-NUM-FR-03 (sample) Comparing fractions")).toBeVisible();
  await page.getByRole("link", { name: "All recommendations" }).click();
  await expect(page.getByRole("heading", { name: "Recommendations", level: 1 })).toBeVisible();
});

test("AI lesson plan becomes a lesson draft in the editor", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/ai");
  await page.getByLabel("Topic").fill("adding fractions");
  await page.getByLabel(/Outcome code/).fill("G5-NUM-FR-06");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await page.waitForURL(/\/teacher\/ai\/[^/?]+$/);
  // No API key in tests: the honest template fallback.
  await expect(page.getByText("Template suggestion (AI not connected)").first()).toBeVisible();
  await page.getByLabel("Lesson title").fill("Adding fractions with the same denominator");
  await page.getByLabel("Check question 1").fill("1/5 + 2/5 = ?");
  await page.getByRole("button", { name: "Create lesson draft" }).click();
  await page.waitForURL(/\/teacher\/lessons\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Adding fractions with the same denominator" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Curriculum outcome code")).toHaveValue("G5-NUM-FR-06");
  await expect(page.getByLabel("Question 1 prompt")).toHaveValue("1/5 + 2/5 = ?");
});

test("AI quiz becomes an assignment draft with its questions", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/ai?tool=quiz");
  await page.getByLabel("Topic").fill("comparing fractions");
  await page.getByLabel("Number of questions").fill("3");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await page.waitForURL(/\/teacher\/ai\/[^/?]+$/);
  await page.getByLabel("Question 1 prompt").fill("Which is bigger: 3/4 or 2/3?");
  await page.getByLabel("Question 1 prompt").press("Tab");
  await page.getByLabel("Assignment title").fill("Comparing fractions exit quiz");
  await page.getByRole("button", { name: "Create assignment draft" }).click();
  await page.waitForURL(/\/teacher\/assignments\/[^/]+\/edit$/);
  await expect(page.getByRole("heading", { name: "Edit: Comparing fractions exit quiz" })).toBeVisible();
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue("Which is bigger: 3/4 or 2/3?");
});

test("AI feedback is copied into marking; drafts can be discarded", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/assignments");
  await page.getByRole("link", { name: "Comparing fractions quiz" }).click();
  await page.locator("tr", { hasText: "Hamdan Al Suwaidi" }).getByRole("link", { name: "Mark" }).click();
  await page.getByRole("link", { name: "Draft feedback with AI" }).click();
  await expect(page.getByLabel("Submission")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Generate draft" }).click();
  await page.waitForURL(/\/teacher\/ai\/[^/?]+$/);
  await expect(page.getByLabel("Feedback for the student")).toHaveValue(/Hamdan/);
  await page.getByRole("button", { name: "Use in marking" }).click();
  await page.waitForURL(/\/submissions\/.+\?aiDraft=/);
  await expect(page.getByLabel("Feedback for the student")).toHaveValue(/Next step:/);

  await page.goto("/teacher/ai");
  await page.getByRole("link", { name: /Parent update:/ }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await page.waitForURL(/\/teacher\/ai$/);
  await expect(page.getByRole("link", { name: /Parent update:/ })).toHaveCount(0);
});

test("student progress shows the class, mastery and one student's detail", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/progress");
  await expect(page.getByRole("heading", { name: "5B Mathematics", level: 1 })).toBeVisible();
  const row = page.locator("tr", { hasText: "Aisha Rahman" }).first();
  await expect(row).toContainText("20%");
  await expect(page.getByRole("columnheader", { name: /G5-NUM-FR-03/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Students who may need a check-in" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Sofia Petrova" }).filter({ hasText: "not handed in" })).toBeVisible();
  await row.getByRole("link", { name: "Aisha Rahman" }).click();
  await expect(page.getByRole("heading", { name: "Aisha Rahman", level: 1 })).toBeVisible();
  await expect(page.getByText("Review the lesson: Comparing fractions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reasoning skills and wellbeing summaries" })).toBeVisible();
});

test("teacher reviews, modifies and creates recommendations", async ({ page }) => {
  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/recommendations");
  const kenji = page.getByRole("article", { name: /for Kenji Watanabe/ });
  await kenji.getByRole("button", { name: "Modify" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What students will see").fill("Stretch: fractions between 1/3 and 1/2");
  await dialog.getByLabel("Evidence note").fill("Ready for an open-ended task.");
  await dialog.getByRole("button", { name: "Save & approve" }).click();
  await expect(kenji).toHaveCount(0);
  const kenjiId = (await db.user.findUniqueOrThrow({ where: { email: "kenji@crescentbay.example" } })).id;
  expect(await db.notification.count({ where: { userId: kenjiId, body: "Stretch: fractions between 1/3 and 1/2" } })).toBe(1);

  const form = page.locator("#new");
  await form.getByRole("button", { name: "Select whole class" }).first().click();
  await expect(form.getByText("8 selected")).toBeVisible();
  await form.getByLabel("What students will see").fill("Fraction strips warm-up before Thursday");
  await form.getByLabel("Evidence note").fill("Whole-class reteach after the check-in.");
  await form.getByRole("button", { name: "Assign now" }).click();
  await expect(form.getByText("Recommendation saved.")).toBeVisible();

  await page.getByRole("link", { name: /^Active/ }).click();
  await expect(page.getByRole("article", { name: /Stretch: fractions between 1\/3 and 1\/2 for Kenji/ })).toBeVisible();
  await expect(page.getByRole("article", { name: /Fraction strips warm-up before Thursday/ })).toHaveCount(8);
  await page.getByRole("article", { name: /Number line warm-up, 10 minutes for Zara/ }).getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("article", { name: /Number line warm-up/ })).toHaveCount(0);
  await page.getByRole("link", { name: /^Done/ }).click();
  await expect(page.getByRole("article", { name: /Number line warm-up, 10 minutes for Zara/ })).toBeVisible();
});

test("another school's teacher can't see these students or drafts", async ({ page }) => {
  const sara = await db.user.findUniqueOrThrow({ where: { email: "sara.mitchell@crescentbay.example" } });
  const draft = await db.aiDraft.findFirstOrThrow({ where: { teacherId: sara.id } });
  const layla = await db.user.findUniqueOrThrow({ where: { email: "layla@crescentbay.example" } });
  await login(page, "omar.farouk@palmgrove.example");
  expect((await page.goto(`/teacher/ai/${draft.id}`))?.status()).toBe(404);
  expect((await page.goto(`/teacher/progress/${layla.id}`))?.status()).toBe(404);
  await page.goto("/teacher/recommendations?status=active");
  await expect(page.getByText("Layla Hassan")).toHaveCount(0);
  await page.goto("/teacher/progress");
  await expect(page.getByText("Layla Hassan")).toHaveCount(0);
});
