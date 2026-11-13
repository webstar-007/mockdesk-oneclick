# MockDesk — online mock-test platform (currently: SSC CGL Tier-II)

A realistic computer-based-test simulator for government exams. Live exam today: **SSC CGL Tier-II (Paper-I)** with five full-length
mocks. It has sectional timers, the question palette with the five SSC statuses, server-side clock and scoring, per-question
solutions, review mode with filters, and a progress dashboard. It works on desktop, tablet and phone, in light and dark mode.

## Quick start (3 steps)
1. Install **Node.js 22.13 or newer** from https://nodejs.org (the app uses Node's built-in SQLite, nothing else to install).
2. Unzip `mockdesk.zip`. You get one folder, `mockdesk`, with every file directly inside it (open a terminal in that folder for the commands below).
3. Run it:
   - macOS / Linux: `./start.sh`
   - Windows: double-click `start.bat`

The script installs the packages (first run only, needs internet), builds the web app, checks the question banks, starts the
server and opens **http://localhost:3000** in your browser. Press `Ctrl+C` in the window to stop. Create an account on the
sign-up page and start a mock from the dashboard.

Is everything OK? Run `./check.sh` (Windows: `check.bat`). It checks Node, packages, configuration, every question bank,
and runs a live smoke test (register → start → answer → submit → graded). Add `--full` for the unit tests and a fresh build.

### Script options
| command | what it does |
|---|---|
| `./start.sh --preview` | also lists mocks whose questions are not complete yet (testing only) |
| `./start.sh --port 4000` | use another port (it also moves on by itself if 3000 is busy) |
| `./start.sh --no-open` | do not open the browser |
| `./start.sh --rebuild` | force a fresh web-app build |
| `./start.sh --reset-db` | delete all accounts and attempts, then start |
| `./check.sh --full` | readiness check plus unit tests plus a fresh build |

The same commands exist as npm scripts: `npm run start:all`, `npm run check`, `npm run check:full`, `npm run status`.

## What students get
- Instructions page, then the exam: one timer per section, sections lock when submitted or when time ends (auto-submit).
- Palette: Not Visited, Not Answered, Answered, Marked for Review, Answered & Marked for Review.
- Select / change / clear an answer, mark for review, Previous / Save & Next, jump from the palette, keyboard keys (1-4 or A-D, left/right arrows).
- Autosave every 10 s and on every change. Closing the tab and signing in again resumes where you were; the clock keeps running.
- Review mode: every question with your answer, the correct answer, marks gained/lost, why your option was wrong, the step-by-step solution,
  a faster method where one exists, and filters (All, Correct, Incorrect, Unattempted, Marked, by section).
- Result analysis: total score out of 390 (Computer excluded), a separate qualifying card for Computer, section-wise table, charts, weak topics, traps and revision list.
- Home page: exam tabs, a hero that starts or resumes the next mock, progress rings, stats, the exam pattern, mock cards with status filters, a short playbook, then score comparison, accuracy trend, section strengths, weakest topics and attempt history.
- **Dark / light mode** toggle in the header and on the sign-in page (remembers your choice, defaults to your device setting). The exam screen stays distraction-free and has no toggle.
- **Home page for returning students** is task-focused: hero, numbers, cockpit (readiness, radar, plan, trajectory, weakest topics, streak), mocks, toolkit shortcuts, exam-day playbook and attempt history. The "Why MockDesk" strip is shown only to students who have not finished a mock yet.
- **PDF report**: on the result page, "Download PDF" gives a real PDF with the score, section, difficulty and topic analysis, the three fixes, a comparison with the previous attempt and worked solutions with diagrams, either for mistakes and skipped questions only or for every question. API: `GET /api/attempts/:id/report.pdf[?scope=all]`. Built with `pdfkit` and `svg-to-pdfkit` using the DejaVu Sans fonts in `server/assets/fonts` (free licence). Run `npm install` once after updating.
- **Exam blueprint** on the home page replaces the old pattern strip: a timed track of the sections, a card per section and the marking rules, all read from `config/exam.config.js`.
- **Instructions page** redesigned with a hero, coloured section list and a sticky "Before you begin" card.
- **Exam toolkit** (`/toolkit`, "Toolkit" in the header): a score calculator for checking your marks against the official answer key (+3 / −1, Computer qualifying at 27 of 60), a pace planner that turns your start time into a clock plan per section, a "should I guess?" tool (a guess pays only when you are at least 25% sure) and an interactive exam-day checklist. Everything is saved on the device only. The exam screen also has a "View instructions" button, like the real CBT.
- **Profile page**: identity banner with level, four headline numbers, eight achievement badges, a practice-activity map, account details, appearance (Light / Dark / Device), and "your data" (download all results as JSON, clear notes saved on this device). Target score and exam date were removed from the profile; the API still accepts them and the dashboard shows them for accounts that already set them.
- **Performance cockpit** on the home page once you finish a mock: exam-readiness gauge, skill radar, score trajectory, 100-day practice streak map and a weekly study plan with checkboxes (stored in your browser).
- **Deeper analysis**: comparison with other students (rank and percentile unlock once 10 students have finished the mock), change versus your previous attempt, marks breakdown, pace per question, accuracy by difficulty, question timeline, topic table and three priority fixes.
- **Smarter review**: search, filters, bookmarks, personal notes per question (browser only), shareable question links and a jump-to-next-mistake button.
- Sign in with a **one-time code** (type a mobile number or an email in the same box; it is detected automatically) or a password. A new email or number is asked for a name before the account is created (or they can use Sign up); an unknown email on password sign-in is told to create an account. Sign-up by password stays available.
- Redesigned sign-in and sign-up pages: split layout, 6-box code entry that verifies as soon as the last digit is typed, show/hide password, dark/light support, and a footer on every signed-in page.

## Exam pattern (central config)
`config/exam.config.js` is the **only** place the pattern lives: sections, questions per section, marks, negative marking,
timed segments (one per section now; use a single segment for an overall timer), palette labels, autosave interval, warning time.
Current setting: 150 questions in 135 minutes; +3 / −1; Maths 30 min, Reasoning 30, English 40, GA 20, Computer 15.

**Computer Knowledge is qualifying only.** A candidate qualifies with at least 27 of its 60 marks (`qualifying: true, qualifyingMarks: 27` in the config). Its marks are **not** added to the total, so the scored total is 130 questions = **390 marks**. The result page shows a separate Qualified / Not qualified card with the cut-off and the shortfall, the dashboard shows a "Computer qualified n/m" counter and a per-attempt badge, and the Computer review questions carry a *Qualifying* tag. To change the cut-off or make another section qualifying, edit that section in `config/exam.config.js`. Results stored by an older version are upgraded automatically when read.
Server grading, timers, the exam UI, the analysis and the validator all read it. Verify it against the latest SSC notice every cycle.

## Questions
Question banks live in `content/<mockId>/<section>.json`, separate from the UI. Schema: `docs/CONTENT_GUIDE.md`.
The validator (`npm run validate`) checks counts, four distinct options, one key, explanations, a reason for every wrong option,
duplicates, answer-position balance, difficulty mix, and **re-computes every maths answer** from an independent `check` expression.
A mock is shown to students only when all five sections pass. Calibration target: at par with Tier-II Paper-I of the last
three cycles and slightly harder (`docs/TRENDS.md`, `docs/BLUEPRINT.md`, `docs/WRITER_BRIEF.md`).
General Awareness carries current-affairs questions in every mock (flagged `currentAffairs`, with `asOf` and `source`), at least 5 per mock from the six months before 10 Nov 2026. Refresh them before each exam cycle.

### Add a mock
Create `content/mock6/<section>.json` for the five sections, add an entry to `config/mocks.config.js`, run `./check.sh`.

### Add another exam
1. Add the exam to `src/lib/exams.js`; it appears as a tab on the home page.
2. Add its pattern (`config/exam.config.js`), its mocks (`config/mocks.config.js`) and its question banks under `content/`.
3. Run `./check.sh`.
The server currently serves one exam pattern at a time, so a second exam also needs per-exam config selection in `server/app.js`.

### Question-bank status
<!-- STATUS:START -->
| Mock | Maths | Reasoning | English | GA | Computer | Status |
|---|---|---|---|---|---|---|
| CGL Tier-II Mock 1 (moderate) | 30/30 | 30/30 | 45/45 | 25/25 | 20/20 | complete, live |
| CGL Tier-II Mock 2 (moderate) | 30/30 | 30/30 | 45/45 | 25/25 | 20/20 | complete, live |
| CGL Tier-II Mock 3 (hard) | 30/30 | 30/30 | 45/45 | 25/25 | 20/20 | complete, live |
| CGL Tier-II Mock 4 (hard) | 30/30 | 30/30 | 45/45 | 25/25 | 20/20 | complete, live |
| CGL Tier-II Mock 5 (hard) | 30/30 | 30/30 | 45/45 | 25/25 | 20/20 | complete, live |
<!-- STATUS:END -->

## Project layout
| Path | Purpose |
|---|---|
| `start.sh` `start.bat` `check.sh` `check.bat` | one-command run and readiness check |
| `.env.example` | template for OTP delivery and other settings (copy to `.env`) |
| `scripts/` | `start.mjs`, `check.mjs`, `status.mjs` |
| `config/` | `exam.config.js` (pattern), `mocks.config.js` (registry) |
| `content/` | question banks, one folder per mock |
| `server/` | Express API (`app.js`), OTP delivery (`lib/otp.js`), grading (`lib/scoring.js`), bank loader/validator (`lib/bank.js`), SQLite (`lib/db.js`), tests |
| `src/` | React client: `pages/` (Auth, Dashboard, Instructions, Exam, Result, Review, Profile) and reusable `components/` (Header, Timer, Palette, QuestionView, OptionList, SolutionViewer, Charts, Modal), `lib/exams.js` (exam list) and `styles/` (`global`, `home`, `auth`, `exam`, `analysis`) |
| `docs/` | `API.md`, `CONTENT_GUIDE.md`, `WRITER_BRIEF.md`, `BLUEPRINT.md`, `TRENDS.md` |
| `data/` | the SQLite database (created on first run; back up this folder) |

## OTP sign-in setup (email and mobile)
Out of the box the 6-digit code is **printed in the server console**, which is enough to try it. For real users, copy `.env.example` to `.env`, fill in the delivery settings and restart:
- **Email:** any SMTP account (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
- **Mobile:** `SMS_PROVIDER=twilio` (with `TWILIO_*`) or `SMS_PROVIDER=msg91` (with `MSG91_AUTH_KEY` and a DLT-approved `MSG91_TEMPLATE_ID`, required for SMS in India).
Codes expire in 10 minutes, work once, are stored hashed, lock after 5 wrong tries, and are limited to one per 30 s and five per hour per email or number. With `NODE_ENV=production` and no delivery settings, requesting a code returns an error instead of printing it.
The SMTP, Twilio and MSG91 senders have not been exercised against live accounts in this build; send yourself a test code first.

## Security model
Correct answers, explanations and solutions never leave the server until an attempt is submitted; a section's questions are sent
only while that section is open; the server owns the clock (5 s grace for late saves) and does all scoring; passwords and OTP codes are hashed
with scrypt; sessions use an httpOnly cookie; sign-in is rate limited; users can read only their own attempts.
For a public deployment put it behind HTTPS and set `NODE_ENV=production` (adds the `Secure` cookie flag).

## Development
`npm run dev:server` (API on :3000) and `npm run dev:client` (Vite on :5173, proxies `/api`). Tests: `npm test`
(run with `MOCKDESK_ALLOW_INCOMPLETE=1` while some banks are incomplete). Environment variables are listed in `docs/API.md`;
`MOCKDESK_TIME_SCALE=0.02` shortens every timer for testing (30 min becomes 36 s).

## Troubleshooting
| problem | fix |
|---|---|
| "Node.js 22.13 or newer is required" | install the current LTS from nodejs.org, then run the script again |
| `npm install` fails | needs internet on the first run; check the connection or proxy and retry |
| Port already in use | the script picks the next free port; or use `--port` |
| Dashboard shows no mocks | no mock bank is complete yet; run `./start.sh --preview` or see the status table |
| Forgot a password | no email reset exists yet: use `./start.sh --reset-db` (removes all accounts) or edit the database |
| Browser did not open | open the URL printed in the terminal |


## Chart tooltips and PDF menu

- `src/components/Tip.jsx` is one shared tooltip for every bar, box, heat-map cell, trajectory point and radar dot. Add `{...tip({ t, v, rows, tone, hint })}` to any element. Mouse hover, keyboard focus and touch (first tap shows it, second tap follows a link) are all handled.
- `src/components/PdfMenu.jsx` is the only PDF control. It always offers the same two downloads (report with mistakes, full solutions) on the result page, at the bottom of the result page and in the attempt history.


## Admin dashboard

A full browser console lives at `/admin` for admins: users and their results, all attempts, a mock builder with a question editor (images, tags, difficulty, drag to reorder, CSV import), question bank, analytics, student reports, announcements and an audit log, plus integrity flags, a build-mock-from-bank tool, a syllabus coverage map, a content-editor role and a system health page. See [docs/ADMIN.md](docs/ADMIN.md) for how to become an admin and what each page does.

## Fullscreen test lock
While a student is in a test (`/exam/:id`) the page asks for fullscreen and keeps them inside: leaving fullscreen, switching tab or window, or pressing Back shows a blocking "return to the test" screen and counts the attempt. Copy, paste, right-click and common shortcuts (F5, Ctrl+R/W/T/N/P/S, DevTools) are blocked. The timer never pauses. Browsers cannot be locked completely (for example Alt+Tab or closing the browser), and iPhone Safari has no fullscreen, so there it falls back to tab-switch and Back detection. Code: `src/components/ExamLock.jsx`.
