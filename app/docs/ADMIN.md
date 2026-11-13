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
| Settings | Announcement banner for students, the exam pattern, the audit log of every admin action |

## Newer tools
- **Preview as student** (mock builder): the home card, the instructions and the real exam screen with palette and timers. Nothing is saved or counted. Tick "Show correct answers" to check your keys.
- **Question bank**: add questions without a mock (they go to the question pool), see when and by whom each was added, filter by date added, select many and add them to a mock, tag, set difficulty or delete in one go. In a mock, use "Add from question bank".
- **Correct answer**: in the question editor, Options tab, tick "Correct answer" under the right option. A question cannot be saved until one is chosen.
- **Search** (Ctrl+K), **Live tests** (who is taking a test right now), **student segments** on the Users page (new, never tested, inactive 7+ days, top performers, struggling), and a **database backup** download in Settings.

## Rules worth knowing
- Students only see **published** mocks. Publishing is blocked until validation passes (sections full, one correct answer, no duplicates).
- Attempts keep a snapshot of their questions, so editing a mock never changes past results.
- A mock that has attempts is archived instead of deleted.
- Images are stored in `data/uploads` (override with `MOCKDESK_UPLOADS`). PNG, JPG, WebP or GIF up to 4 MB, checked by file signature.
- Role changes and deletions ask you to type the user's email to confirm.
- Question CSV columns: section, difficulty, topic, subtopic, tags (`;` separated), question, option_a..option_d, correct (A to D), explanation, steps (`|` separated), shortcut, trap, revise, passage. The editor has a template download.
- The API behind this is under `/api/admin/*` (admin role required, checked on the server).
