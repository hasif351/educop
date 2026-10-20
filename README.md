# Educop MVP

The first working slice of Educop, an AI-powered KG–12 learning platform. It covers the **MVP core** from the product spec:

- Sign-in with role-based dashboards (student, teacher, parent, school admin, platform admin)
- Student dashboard: today's lessons, to-do list, subject progress, recent results and recommendations
- Teacher dashboard: today's lessons, marking queue, recent results, recommendations to review, and students who may need support
- Daily lessons in the 8-part structure, with a lesson editor for teachers and a lesson player for students
- Assignments: builder (multiple choice and short answer), student submission, automatic marking, teacher marking, late policy, gradebook and question analysis
- A rule-based recommendation engine that runs whenever a submission is fully marked
- **Multi-school from day one**: organisations → schools → everything else, with data isolated per school

All demo people, schools and results are fictional.

![Student dashboard](docs/screenshots/student-dashboard.png)

---

## Run it locally

You need **Node.js 20+** and **PostgreSQL 14+**.

```bash
npm install
cp .env.example .env            # then set DATABASE_URL and SESSION_SECRET
npx prisma migrate deploy       # create the tables
npm run db:seed                 # load the two demo schools
npm run dev                     # http://localhost:3000
```

To get a SESSION_SECRET, run `openssl rand -base64 48`.

### Demo accounts

Every account uses the password **`Educop!2026`**. The login page lists them outside production.

| Role | Email | School |
|---|---|---|
| Student (Grade 5) | layla@crescentbay.example | Crescent Bay International School |
| Teacher | sara.mitchell@crescentbay.example | Crescent Bay |
| Parent of Layla and Adam | rania.hassan@example.com | Crescent Bay |
| School admin | admin@crescentbay.example | Crescent Bay |
| Teacher, second school | omar.farouk@palmgrove.example | Palm Grove Academy |
| Platform admin | platform@educop.example | All schools |

### Tests

```bash
npm test             # unit tests: grading, late policy, recommendations, route ownership
npm run build
npm run test:e2e     # end-to-end in Chromium: re-seeds the database, starts the app on port 3100
```

The end-to-end suite covers the full loop. A student completes a lesson and submits an assignment. The teacher marks the short answer and approves a stretch suggestion, and the student sees the result. It also covers a teacher building and publishing a lesson and an assignment, wrong-password handling, role redirects, the parent view, the platform view, and **cross-school isolation** (a Palm Grove teacher gets a 404 on a Crescent Bay assignment URL).

---

## Technology choices

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript | One codebase for UI and server logic. Server Components keep data access on the server. |
| Styling | Tailwind CSS 3, design tokens in `globals.css` | Same blue and teal palette as the UI preview, with automatic dark mode |
| Database | PostgreSQL + Prisma 6 | Relational data (schools, classes, enrolments), typed queries and migrations |
| Auth | Email and password (bcrypt) plus a signed JWT in an httpOnly cookie (jose) | No external dependency for the MVP. SSO (Microsoft, Google, UAE Pass) can be added behind the same session shape. |
| Validation | zod on every server action | |
| Tests | Vitest (unit), Playwright (end-to-end) | |

This is deliberately the simplest stack that can carry the product: no separate API service, queue or cache yet.

## How the code is organised

```
prisma/schema.prisma        data model (multi-school)
prisma/seed.ts              two fictional schools in two organisations
src/middleware.ts           blocks the wrong role at the URL level
src/lib/auth.ts             requireRole(): server-side guard used by every page and action
src/lib/data.ts             ALL reads: scoped by schoolId + relationship (enrolled / teaches / parent of)
src/lib/grading.ts          pure marking rules (auto-mark, late days, penalty, totals)
src/lib/recommend.ts        pure recommendation rules with evidence
src/lib/submit.ts           re-scores a submission and triggers recommendations once
src/app/student/…           dashboard, lessons, lesson player, assignments
src/app/teacher/…           dashboard, lesson editor, assignment builder, gradebook, marking
src/app/parent|admin|platform  first versions of the other roles' home pages
```

## Multi-school design

- **Organisation → School → (users, subjects, classes, lessons, assignments, audit log).** A school group can run several schools, and independent schools are an organisation of one.
- Every school-owned row has a `schoolId`. Users belong to one school, and only the platform admin has `schoolId = null`.
- The session carries `schoolId`. Every query in `src/lib/data.ts` and every server action filters by it **and** by the user's relationship to the record. A teacher must teach the class, a student must be enrolled, and a parent must have a verified link. Guessing an id from another school or class returns 404.
- The platform admin sees per-school totals, not student records.
- School-level settings already in the model: curriculum label, time zone, academic years and active/suspended status. A suspended school's users can't sign in.
- **Adding a school today** means inserting an organisation and a school, then users and classes. See `prisma/seed.ts` for the shape. A platform-admin "Add school" screen and CSV roster import are next.
- **Later options** if a client needs them: Postgres row-level security as a second line of defence, or a separate database per large school group. The `schoolId` column makes either possible without changing the app's queries much.

## Recommendation engine (MVP rules)

When a submission is fully marked, `src/lib/recommend.ts` suggests:

| Score | Suggestion | Visible to student |
|---|---|---|
| below 60% | Review the linked lesson | Immediately |
| 60–85% | Extra practice on the topic | Immediately |
| 90% and above | Challenge task | **After teacher approval** |

Each suggestion stores its evidence ("Comparing fractions quiz: 4/10 (40%)") and shows it to the student under "Why am I seeing this?". Teachers also see students below 60% in a support list, worded as a prompt for a check-in, not a label.

## Security already in place

- bcrypt password hashes, constant-time response for unknown emails, 5 failed sign-ins per 15 minutes per email and IP
- httpOnly, SameSite=Lax session cookie (Secure in production), 12-hour expiry
- Role check in middleware **and** again next to every data access
- Answer keys never reach the browser before a student submits
- zod validation and length limits on all input, and server actions protected by Next.js origin checks
- Audit log for sign-ins, content changes, submissions, marking and recommendation decisions
- Security headers (frame-deny, nosniff, referrer and permissions policy)

## Not built yet (next phases)

- Password reset, SSO and MFA for staff
- School admin tools: users, classes, curriculum setup, approvals, CSV import
- Platform admin: create and suspend schools, billing
- Notifications (email, push) and the full parent portal
- AI features: lesson and quiz generation, AI study buddy, AI-written recommendation text (all with teacher review)
- Virtual classroom, cognitive skills assessments, development (SEL) module, analytics
- File uploads (private object storage), question banks, rubrics
- Production rate limiting across several servers (the current limiter is per process)
- Legal review of UAE data-protection requirements before handling real student data

## Deployment notes

Any Node host with PostgreSQL works (for example a managed Postgres plus a container or Node service). Run `npx prisma migrate deploy` on release, set `NODE_ENV=production`, `DATABASE_URL` and a strong `SESSION_SECRET`, and keep the database and app in a UAE or GCC region if the school requires data residency. `/api/health` returns 200 when the app can reach the database.
