import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Educop!2026";

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

test("parent switches between verified children and sees privacy-respecting overview", async ({ page }) => {
  await login(page, "rania.hassan@example.com");
  // Children are listed by name; the first one is shown until the parent switches.
  await expect(page.getByRole("heading", { name: "Adam's overview" })).toBeVisible();
  await page.getByRole("link", { name: /Layla Hassan/ }).click();
  await expect(page.getByRole("heading", { name: "Layla's overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent results" })).toBeVisible();
  await expect(page.getByText("Excellent reasoning about piece sizes.").or(page.getByText("Good effort. Remember")).first()).toBeVisible();
  await expect(page.getByText(/wellbeing check-ins are private to Layla/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Message teacher" })).toHaveAttribute("href", "/parent/messages");

  // A child id that isn't this parent's verified child is a 404.
  const res = await page.goto("/parent?child=not-my-child");
  expect(res?.status()).toBe(404);

  await page.goto("/parent/home-learning");
  await page.getByRole("link", { name: /Layla Hassan/ }).click();
  await expect(page.getByRole("heading", { name: "This week with Layla" })).toBeVisible();
  const toggle = page.getByRole("button", { name: /We did this: Try the worksheet: Equivalent fractions/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toBeEnabled(); // saved on the server
  await page.reload();
  await expect(page.getByRole("button", { name: /We did this: Try the worksheet: Equivalent fractions/ })).toHaveAttribute("aria-pressed", "true");
});

test("parent with an unverified link sees nothing about the child", async ({ page }) => {
  await login(page, "marta.petrova@example.com");
  await expect(page.getByText("No linked children yet")).toBeVisible();
  await expect(page.getByText(/waiting for the school to verify/)).toBeVisible();
  await expect(page.getByText("Sofia Petrova")).toHaveCount(0);
});

test("school admin overview, approvals and moderation", async ({ page }) => {
  await login(page, "admin@crescentbay.example");
  await expect(page.getByRole("heading", { name: "Crescent Bay International School" })).toBeVisible();
  for (const k of ["Students", "Teachers", "Active today", "Lessons published", "Assignments submitted", "Average score"]) {
    await expect(page.getByText(k, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Classes needing attention" })).toBeVisible();

  // Preview and approve the seeded lesson waiting for approval.
  await page.goto("/admin/approvals");
  await page.getByRole("link", { name: "Preview Plant life cycles" }).click();
  await expect(page.getByRole("heading", { name: "Plant life cycles" })).toBeVisible();
  await expect(page.getByText("Pollen moves between flowers").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText("This lesson isn't waiting for approval.")).toBeVisible();
  await page.goto("/admin/approvals");
  await expect(page.getByText("No lessons are waiting for approval.")).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  await page.goto("/admin/moderation");
  const held = page.locator("li", { hasText: "Parent message auto-held" });
  await expect(held.getByText("055 987 6543")).toBeVisible();
  await held.getByRole("button", { name: "Keep hidden" }).click();
  await expect(held).toHaveCount(0);
  await page.locator("li", { hasText: "AI study buddy reply flagged" }).getByRole("button", { name: /^Dismiss/ }).click();
  await expect(page.locator("li", { hasText: "AI study buddy reply flagged" })).toHaveCount(0);
  await page.getByRole("link", { name: "Resolved" }).click();
  await expect(page.getByText("Parent message auto-held")).toBeVisible();

  // Reports and the CSV download.
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "By subject" })).toBeVisible();
  const res = await page.request.get("/admin/reports/csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain("5B Mathematics");
});

test("school admin manages people: add, verify link, import roster, deactivate", async ({ page }) => {
  await login(page, "admin@crescentbay.example");
  await page.goto("/admin/users");

  // Verify the waiting parent link.
  await page.getByRole("button", { name: "Verify Marta Petrova as parent of Sofia Petrova" }).click();
  await expect(page.getByText("No links waiting for verification.")).toBeVisible();

  // Add a teacher and read the one-time password.
  const add = page.locator("#add");
  await add.getByLabel("Full name").fill("Huda Karim");
  await add.getByLabel("Email").fill("huda.karim@crescentbay.example");
  await add.getByLabel("Role").selectOption("TEACHER");
  await add.getByRole("button", { name: "Add user" }).click();
  const password = (await page.getByTestId("temp-password").textContent())!.trim();
  expect(password).toMatch(/^[A-Z][a-z]{3}-[a-z]{4}-\d{4}$/);

  // Roster import: dry run with an error row, then commit the valid rows.
  await page.goto("/admin/users/import");
  await page.getByLabel("CSV text").fill([
    "name,email,role,grade,parent_email",
    "Mina Ali,mina.ali@crescentbay.example,student,4,omar.ali@example.com",
    "Omar Ali,omar.ali@example.com,parent,,",
    "Bad Row,layla@crescentbay.example,student,15,",
  ].join("\n"));
  await page.getByRole("button", { name: "Preview (dry run)" }).click();
  await expect(page.getByText("nothing has been created yet")).toBeVisible();
  await expect(page.getByText("This email already has an account.")).toBeVisible();
  await expect(page.getByText("Students need a grade: KG1, KG2 or 1–12.")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 people" }).click();
  await expect(page.getByRole("heading", { name: "Imported 2 people" })).toBeVisible();
  await expect(page.getByText("1 row was skipped")).toBeVisible();

  await page.goto("/admin/users?q=mina");
  await expect(page.locator("tr", { hasText: "Mina Ali" })).toContainText("Verified (1)");

  // Deactivate the new teacher; they can no longer sign in.
  await page.goto("/admin/users?q=huda");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Deactivate Huda Karim" }).click();
  await expect(page.locator("tr", { hasText: "Huda Karim" })).toContainText("Deactivated");
  await signOut(page);
  await page.getByLabel("School email").fill("huda.karim@crescentbay.example");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("don't match");
});

test("school admin creates a class, enrols a student and changes settings", async ({ page }) => {
  await login(page, "admin@crescentbay.example");
  await page.goto("/admin/classes");
  await page.getByLabel("Subject name").fill("Arabic");
  await page.getByLabel("Code").fill("AR");
  await page.getByRole("button", { name: "Add subject" }).click();
  await expect(page.getByText("Arabic added.")).toBeVisible();

  await page.getByLabel("Class name").fill("5B Arabic");
  await page.locator("select[name=subjectId]").selectOption({ label: "Arabic" });
  await page.locator("select[name=teacherId]").selectOption({ label: "Priya Patel" });
  await page.locator("select[name=grade]").selectOption("5");
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByText("5B Arabic created.")).toBeVisible();
  await page.getByRole("link", { name: "Manage 5B Arabic" }).click();
  await page.getByLabel("Layla Hassan").check();
  await page.getByRole("button", { name: "Enrol selected" }).click();
  await expect(page.getByText("1 student enrolled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Layla Hassan" })).toBeVisible();

  await page.goto("/admin/school");
  await page.getByLabel("City").fill("Dubai Marina");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("School settings saved.")).toBeVisible();
});

test("lesson approval: teacher publish waits for the admin when the school requires it", async ({ page }) => {
  await login(page, "admin@crescentbay.example");
  await page.goto("/admin/school");
  await page.getByLabel(/Lessons need approval/).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("School settings saved.")).toBeVisible();
  await signOut(page);

  await login(page, "sara.mitchell@crescentbay.example");
  await page.goto("/teacher/lessons/new");
  await page.getByLabel("Title").fill("Ordering decimals");
  await page.getByLabel(/Learning objectives/).fill("I can order decimals.");
  await page.getByRole("button", { name: "Save & publish" }).click();
  await expect(page.getByText("Lesson saved.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tr", { hasText: "Ordering decimals" })).toContainText("Waiting for approval");
  await signOut(page);

  await login(page, "admin@crescentbay.example");
  await page.goto("/admin/approvals");
  await page.getByRole("link", { name: "Request changes" }).first().click();
  await page.getByLabel(/Note for Sara Mitchell/).fill("Please add a knowledge check.");
  await page.getByRole("button", { name: "Return to teacher" }).click();
  await expect(page.getByText("Returned to the teacher with your note.")).toBeVisible();
  // Put the setting back for the rest of the suite.
  await page.goto("/admin/school");
  await page.getByLabel(/Lessons need approval/).uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("School settings saved.")).toBeVisible();
});

test("platform admin adds a school, suspends it, and sees cross-school totals", async ({ page }) => {
  await login(page, "platform@educop.example");
  await expect(page.getByRole("heading", { name: "Totals by school" })).toBeVisible();
  await expect(page.getByText("Open moderation")).toBeVisible();

  await page.goto("/platform/schools/new");
  await page.locator("select[name=organizationId]").selectOption({ label: "New organisation…" });
  await page.getByLabel("New organisation name").fill("Harbour Lights Trust");
  await page.getByLabel("School name").fill("Harbour Lights School");
  await page.getByLabel("Web name").fill("harbour-lights");
  await page.getByLabel("Admin name").fill("Yusuf Amin");
  await page.getByLabel("Admin email").fill("admin@harbourlights.example");
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page.getByRole("heading", { name: "Harbour Lights School is ready" })).toBeVisible();
  const password = (await page.getByTestId("temp-password").textContent())!.trim();

  await page.goto("/platform/schools");
  const card = page.getByRole("article", { name: "Harbour Lights School" });
  await card.getByLabel("Seat limit for Harbour Lights School").fill("300");
  await card.getByRole("button", { name: "Save plan" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Suspend Harbour Lights School" }).click();
  await expect(card.getByText("Suspended")).toBeVisible();

  await page.goto("/platform/moderation");
  await expect(page.getByText("Teacher-uploaded image missing licence information")).toBeVisible();
  await expect(page.getByText(/Palm Grove Academy · Content/)).toBeVisible();
  await page.goto("/platform/ai-usage");
  await expect(page.getByRole("heading", { name: "Summary by school" })).toBeVisible();
  await page.goto("/platform/audit?action=school.");
  await expect(page.getByRole("cell", { name: "school.suspend" })).toBeVisible();

  // The new admin can't sign in while the school is suspended.
  await signOut(page);
  await page.getByLabel("School email").fill("admin@harbourlights.example");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("don't match");
});

test("a school admin can't open another school's records", async ({ page }) => {
  await login(page, "admin@palmgrove.example");
  await page.goto("/admin/classes");
  await expect(page.getByText("5B Mathematics")).toHaveCount(0);
  await page.goto("/admin/moderation");
  await expect(page.getByText("Parent message auto-held")).toHaveCount(0);
  const res = await page.request.get("/admin/reports/csv");
  expect(await res.text()).not.toContain("5B Mathematics");
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/admin$/);
});
