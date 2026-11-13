# MockDesk API contract (server ⇄ client)

Base: `/api`, JSON in/out, auth via httpOnly cookie `sid`. Errors: `{ "error": "message" }` with proper HTTP status.
The server is the single source of truth for time and scoring. Correct answers and explanations are NEVER sent
before an attempt is submitted, and questions of a segment are only sent while that segment is open.

## Auth / profile
- `POST /auth/register` `{name,email,password}` (password ≥ 8) → 201 `{user}` + cookie
- `POST /auth/otp/request` `{channel:'email'|'sms', identifier}` → `{ok, channel, to (masked), resendIn:30, expiresIn:600}`. Mobile numbers are normalised to E.164 (a bare 10-digit Indian number becomes +91…). Errors: 400 invalid input, 429 `COOLDOWN` (30 s between codes) or `HOURLY` (5 per hour per email/number), 502/503 delivery failed or not configured.
- `POST /auth/otp/verify` `{channel, identifier, code}` → `{user, isNew}` + cookie. Codes are 6 digits, valid 10 minutes, single use, hashed at rest; 5 wrong tries lock the code (429 `LOCKED`); expired or missing → 400 `EXPIRED`. An unknown email or number creates an account (default name from the email, or "Student").
- `POST /auth/login` `{email,password}` → `{user}` + cookie · `POST /auth/logout` → `{ok:true}`
- `GET /me` → `{user}` (401 if not signed in) · `PATCH /me` `{name?, targetScore?, examDate?}` → `{user}`
- `user` = `{id,name,email,phone,targetScore,examDate,createdAt}` (`email` or `phone` can be null for OTP-only accounts)

## Health
- `GET /health` (public) → `{ ok:true, exam, mocks:n }` — `mocks` is the number of mocks currently listed to students. Used by `scripts/start.mjs` to know when the server is up.

## Catalogue
- `GET /config` (public) → `{ exam, sections:{key:{name,short,questions,marksPerQuestion,negativeMarks,qualifying?,qualifyingMarks?}}, scoredMarks, segments:[{id,sections,minutes}], instructions:[...], lowTimeWarningSeconds, autosaveMs }` — straight from config/exam.config.js (+ `instructions` array from config).
- `GET /mocks` → `{ mocks:[{ id, number, name, difficulty, description, totalQuestions, totalMarks, totalMinutes (totals count scored sections only), qualifying:[{key,questions,maxMarks,qualifyingMarks}], sections:[{key,questions}], status:'not_attempted'|'in_progress'|'completed', inProgressAttemptId, attempts:n, best:{score,percentage}|null, last:{attemptId,score,percentage,submittedAt}|null }] }` (only mocks whose question bank passes validation are listed as available).

## Attempt lifecycle
- `POST /mocks/:mockId/start` → resumes the user's in-progress attempt, otherwise creates one → `{attemptId, resumed:boolean}`
- `GET /attempts/:id` (owner only). If in progress → `{ status:'in_progress', attempt: AttemptState }`; if submitted → `{ status:'submitted' }`.
  Lazy expiry: before answering, the server advances any segment whose time has run out (auto-submit of segment, and of the attempt if it was the last).
  `AttemptState = { id, mockId, mockName, difficulty, segmentIndex, segments:[{id,sections,minutes,state:'locked'|'open'|'upcoming'}], segmentEndsAt (ISO), serverNow (ISO), questions:[PublicQuestion] (open segment only), responses:{[qid]:{selected:int|null, marked:bool, visited:bool, timeMs:int}}, lastQid }`
  `PublicQuestion = { id, section, index, text, options[4], passage|null, passageId|null, table|null, marks, negativeMarks }`
- `PUT /attempts/:id/responses` `{ responses:{[qid]:{selected,marked,visited,timeMs}}, lastQid }` — merge-save for questions of the OPEN segment only (others ignored). 409 `{error, code:'SEGMENT_EXPIRED'}` if the segment already ended (response includes fresh state fetch hint). Returns `{ok:true, serverNow}`.
- `POST /attempts/:id/segment/submit` `{responses?}` — saves any given responses, locks the current segment, opens the next (or finalises on the last segment) → `{ status:'in_progress'|'submitted', attempt?:AttemptState }`
- `POST /attempts/:id/submit` `{responses?}` — finalise the whole attempt now (all remaining segments are closed with no answers) → `{status:'submitted'}`
- Server rules: `segmentEndsAt = segmentStart + minutes*60s`; a 5 s grace for late saves; marks = correct×marksPerQuestion − wrong×negativeMarks (config); `selected` outside 0..3 is rejected.

## Results (submitted attempts only; 409 otherwise)
- `GET /attempts/:id/result` → also returns `compare` (previous attempt of the same mock) and `community` (`{unlocked:false,users,needed:10}` until 10 students finish the mock, then rank, percentile, average and top score). Base shape:
```
{ attempt:{id,mockId,mockName,difficulty,startedAt,submittedAt,autoSubmitted:boolean},
  summary:{score,maxMarks,percentage,totalQuestions,correct,incorrect,unattempted,attempted,accuracy,timeTakenSec,avgTimePerQuestionSec,marked,qualified:true|false|null},  // scored sections only (Computer excluded)
  qualifying:[{key,name,short,score,maxMarks,qualifyingMarks,qualified,correct,incorrect,unattempted,accuracy,timeSec}],  // qualifying sections, reported apart from the total
  version:2,
  sections:[{key,name,short,total,attempted,correct,incorrect,unattempted,score,maxMarks,accuracy,timeSec}],
  topics:[{topic,section,total,correct,incorrect,unattempted,accuracy}],
  questions:[{ id,section,index,topic,subtopic,difficulty,text,passage,table,options,selected,correct,status:'correct'|'incorrect'|'unattempted',
               marked,qualifying:boolean,marksAwarded,timeSec,explanation,steps,shortcut,trap,revise,approach,wrongReasons,whyWrong (the wrongReasons entry for the selected option, or null) }] }
```
## History / dashboard
- `GET /attempts` → `{attempts:[{id,mockId,mockName,difficulty,status,startedAt,submittedAt,score,maxMarks,percentage,accuracy,qualified,timeTakenSec,sections:[{key,score,maxMarks,accuracy,attempted}]}]}` newest first.
- `GET /stats` → `{ attempted:n, completed:n, bestScore, avgPercentage, avgAccuracy, trend:[{attemptId,mockName,submittedAt,score,maxMarks,percentage,accuracy}], sections:[{key,name,short,avgPercentage,avgAccuracy,attempts}] (scored sections only), qualifying:{attempts,passed,avgMarks,bestMarks,maxMarks,qualifyingMarks,trend:[{mockName,score,qualified}]}|null, strongest:key|null, weakest:key|null, weakTopics:[{topic,section,accuracy,total}], activity:[ms timestamps of attempt starts, last 100 days] }`


## Environment variables
| variable | default | meaning |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `MOCKDESK_DB` | `data/mockdesk.db` | SQLite file (`:memory:` allowed) |
| `MOCKDESK_ALLOW_INCOMPLETE` | off | `1` lists mocks whose bank is not complete (preview/testing only) |
| `MOCKDESK_TIME_SCALE` | 1 | testing only: `0.02` makes a 30-minute section last 36 s |
| `SMTP_*`, `MAIL_FROM` | | email OTP delivery (see `.env.example`) |
| `SMS_PROVIDER`, `TWILIO_*`, `MSG91_*` | | mobile OTP delivery (`twilio` or `msg91`; see `.env.example`) |
| `NODE_ENV` | | `production` adds the `Secure` flag to the session cookie (use behind HTTPS) |

### GET /api/attempts/:id/report.pdf
Downloads the result, analysis and solutions of a submitted attempt as a PDF (`Content-Disposition: attachment`). `?scope=all` includes solutions for every question; the default covers wrong and skipped questions. 404 for another user's attempt, 409 if not submitted.
