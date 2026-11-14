# Admin dashboard

Open `/admin` while signed in as an admin (an "Admin" link appears in the top bar).

## Becoming an admin
The easiest way: open `admins.txt` in the MockDesk folder and paste emails or mobile numbers, one per line. A person gets admin rights the next time they sign in or sign up with that email or number (no restart needed).
- Set `MOCKDESK_ADMIN_EMAILS=you@example.com` (comma separated) before starting the server. Those accounts are promoted on sign-in or sign-up, or
- sign up on the site, then run `npm run make-admin -- you@example.com` (add `--remove` to undo), or
- an existing admin can promote someone from Users → the user → Make admin (the person then stops being able to use the student side).

## Admin accounts are separate from student accounts
- An admin only sees the admin console. Student pages (home, profile, toolkit, tests) redirect to `/admin`, the student top bar is not shown, and the student API returns 403 for admins.
- Admins are not counted in student totals, funnels or leaderboards.
- Use a separate email for the admin account. To preview a mock as a student, use a normal student account (publish the mock, or keep it as a draft and test after publishing).

## Pages
| Page | What you can do |
|---|---|
| Overview | Totals, new students, live tests, 30-day charts, popular mocks, recent activity, questions most students get wrong |
| Users | Search, filter, sort, export CSV. Open a user for score trend, section and topic strengths, all attempts; rename, suspend, sign out everywhere, set a password, change role, delete |
| Attempts | All attempts with filters (mock, status, dates, score range), CSV export. Open one to see every answer, time per question and explanation |
| Mocks | Create (empty or copy of another), difficulty tag plus free tags, description, order, schedule, draft / published / archived. Builder: add, edit, delete, drag to reorder, copy a question to another mock, import CSV, validation checks, leaderboard |
| Question editor | Section, difficulty, topic, tags, passage, data table, question image, SVG figure, four options each with text and/or an image, correct answer, why-wrong notes, explanation, steps, shortcut, trap, solution image, custom marks, live student preview |
| Question bank | Every question across mocks with real % correct and average time; filter by too hard, too easy or slow |
| Analytics | Score distribution, signup funnel, daily trends, weakest and strongest topics, hardest, easiest and slowest questions, completion per mock |
| Reports | Questions students flagged from the review screen; open the question to fix it, then resolve |
| Settings | Administrators, the exam pattern, backups, the audit log of every admin action |
| Announcements, Notifications, Referrals, Batches, Question quality | See "Growth and coaching tools" below |

## Newer tools
- **Preview as student** (mock builder): the home card, the instructions and the real exam screen with palette and timers. Nothing is saved or counted. Tick "Show correct answers" to check your keys.
- **Question bank**: add questions without a mock (they go to the question pool), see when and by whom each was added, filter by date added, select many and add them to a mock, tag, set difficulty or delete in one go. In a mock, use "Add from question bank".
- **Correct answer**: in the question editor, Options tab, tick "Correct answer" under the right option. A question cannot be saved until one is chosen.
- **Search** (Ctrl+K), **Live tests** (who is taking a test right now), **student segments** on the Users page (new, never tested, inactive 7+ days, top performers, struggling), and a **database backup** download in Settings.

## Editors, Integrity, Builder, Coverage and System

**Editor role.** An editor can only work on content: Mocks, Question bank, Coverage and Reports (student names and emails are hidden). Editors cannot see students, attempts, analytics, settings or the audit log. Make someone an editor in `admins.txt` with `email editor` (or `editor: email`), or from Users > open a person > Change role.

**Integrity.** Lists attempts that look unusual: leaving the test (4+ times is medium, 10+ high), leaving fullscreen 3+ times, answering 30+ questions faster than 10 s each, 90%+ correct at under 20 s per question, and 3+ accounts on one network address. A flag is a reason to look, not proof. Use *Mark reviewed* to hide a checked attempt. Data is collected only for attempts started after this version is installed. Behind a proxy or load balancer set `MOCKDESK_TRUST_PROXY=1` so network addresses are the students', not the proxy's.

**Build from the bank.** Mocks > Build from bank. Choose how many questions per section and difficulty (the exam pattern button fills 30/30/45/25/20), preview, then create a draft. Picks are random and spread across topics. Questions from the bank move into the new mock; questions taken from other mocks are copied. If there are not enough questions you see exactly which section/difficulty is short and can create the draft anyway.

**Coverage.** Per section and topic: questions in the bank, in mocks, in published mocks, difficulty mix and gaps (thin or low). Use it to decide what to write next.

**System.** Uptime, database and disk size, memory, last backup, sign-in code setup, HTTPS, recent server errors and a database check. Orange items need attention before real students use the site.

## Ask your data, doubt help and plain summaries

**Ask your data.** Admin > Ask your data. Type a question in plain English, such as "How did Mock 3 go?", "Which mock is the hardest?", "Top 5 students this week", "How is Priya Sharma doing?", "What are the weakest topics in maths?", "How many new students today?", "Who is taking a test right now?" or "Which questions are students getting wrong most?". It understands mock numbers, student names or emails, sections and times like today, this week and this month. Answers are calculated from your database, so nothing is guessed. If it does not understand, it says so and shows examples. Editors cannot use it.

**Doubt help for students.** After finishing a test, each question in Review has "Ask about this question". It is free and rule based: it answers from the question's own explanation, steps, shortcut, common mistake and notes, and it only talks about that question. Limits and locks:
- Off for any student who has a test running, and never available before submitting.
- 20 questions per hour and 80 per day per student (change with `MOCKDESK_DOUBT_PER_HOUR` and `MOCKDESK_DOUBT_PER_DAY`).
- Switch it off per mock: Mocks > open a mock > Settings > "Let students use doubt help". Turn it off while the mock is a live test, then back on.
- `MOCKDESK_DOUBT_CHAT=off` switches it off for everyone.
Better explanations make better answers, so keep the explanation, steps and shortcut fields filled in. An AI model can be added later behind the same screen.

**Plain-language summary.** Every result page starts with "Your result in plain words": the score against the student's target, strongest and weakest section, topics to fix, time habits, change since the last attempt and up to three next steps.

## Growth and coaching tools

**Announcements.** Admin > Announcements replaces the old single banner. Each message has an optional title, a style (information, good news, warning, urgent), an audience (everyone, new students, students who never started a mock, students inactive for 7 days, or one batch), an optional button link, a start and end time, pin-to-top and "students can close it". It shows as a banner and in the student's bell. Each message shows how many students saw it, clicked it and closed it. You can also send it once as a push or email when it goes live. Drafts, scheduling, duplicate and end-now are built in.

**Notifications and reminders.** Admin > Notifications. The server checks every 10 minutes and sends three kinds of reminder: "you haven't practised in N days", a nudge for new students who have not started a mock, and "Mock X opens tomorrow at 10:00 AM" (uses each mock's "Available from" time). Nobody gets the same reminder twice, a weekly limit and quiet hours apply, and students can turn email or push off in their profile (emails carry an unsubscribe link). Push is free but only works when the site is opened over https. Email needs the same SMTP settings as email sign-in codes plus `MOCKDESK_PUBLIC_URL` (your site address); it costs about $0.10 per 1,000 emails, and the page shows a running estimate. `MOCKDESK_EMAIL_DAILY_CAP` (default 2000) stops a runaway send. `MOCKDESK_TZ` (default Asia/Kolkata) sets the clock for quiet hours. `MOCKDESK_SCHEDULER=off` turns the background sender off. Optional: `MOCKDESK_VAPID_PUBLIC` and `MOCKDESK_VAPID_PRIVATE` fix the push keys; otherwise they are generated once and stored.

**Referrals.** Admin > Referrals. Every student has an invite code and link in their profile. A friend who signs up with it and finishes a first mock (at least 5 questions answered) gets a reward, and so does the inviter (for every N friends, set on the page). The reward is a locked mock: open any mock > Settings > tick "Referral reward". It stays locked until its release date, or forever if it has none, and students open it early by inviting a friend.

**Practice sets.** Students tap "Build my practice set" on the dashboard (10, 20 or 30 questions). It uses their weak topics, prefers unseen questions, and draws from the question bank and mocks they have already finished, never from a mock they have not taken. Practice attempts are labelled practice and never count in averages, leaderboards, rank, "previous attempt" comparisons or admin statistics. Default limit is 5 per student per day (`MOCKDESK_PRACTICE_PER_DAY`).

**Question quality.** Admin > Question quality (editors can use it too). For each question with enough attempts: percentage right, wrong and skipped, average time against the section average, and how students split across options A to D. It flags: answer key may be wrong (a wrong option beat the key), ambiguous (two options each drew 30% or more), reported by students, harder or easier than its tag, often skipped, slow, and no explanation. "Open to fix" jumps to the question.

**Batches.** Admin > Batches. Create a batch (for example a coaching centre's class), add a teacher by email or mobile number (this makes the account a teacher), and add students by pasting emails or numbers, or share the join code or link (`/?batch=CODE`). Students can also enter the code in their profile, and can leave at any time. A teacher signs in and sees only the Teacher view: for each of their own batches, the students, averages, weakest topics, inactive students, each student's results and a CSV download. Teachers cannot take mocks or reach other batches or the admin console. Use a separate email for a teacher.

**Share cards.** After a result, "Share score" draws a picture in the student's browser ("I scored 212/390 on Mock 2") with the site link and their invite code, ready for WhatsApp or an Instagram story. It costs the server nothing.

## Rules worth knowing
- Students only see **published** mocks. Publishing is blocked until validation passes (sections full, one correct answer, no duplicates).
- Attempts keep a snapshot of their questions, so editing a mock never changes past results.
- A mock that has attempts is archived instead of deleted.
- Images are stored in `data/uploads` (override with `MOCKDESK_UPLOADS`). PNG, JPG, WebP or GIF up to 4 MB, checked by file signature.
- Role changes and deletions ask you to type the user's email to confirm.
- Question CSV columns: section, difficulty, topic, subtopic, tags (`;` separated), question, option_a..option_d, correct (A to D), explanation, steps (`|` separated), shortcut, trap, revise, passage. The editor has a template download.
- The API behind this is under `/api/admin/*` (admin role required, checked on the server).
