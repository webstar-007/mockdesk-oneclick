# Writer brief — SSC CGL Tier-II mock questions

You are writing ORIGINAL exam-quality questions for an SSC CGL Tier-II (Paper-I) mock platform.
Project root: the folder containing this file's parent (docs/..). Read these first (in this order):

1. `docs/CONTENT_GUIDE.md` — the JSON schema. AUTHORITATIVE for field names (`trap`, `wrongReasons`, `value`+`check`, `passages`, `passageId`...).
2. `docs/BLUEPRINT.md` — per-section topic allocation, the pattern, and the trend analysis (what recent Tier-II papers test). Use its per-mock subtopic tables (GA, English vocab bands, etc.). Where it conflicts with CONTENT_GUIDE on schema, CONTENT_GUIDE wins.
3. `docs/TRENDS.md` — trend notes.
4. One existing finished file of the same section from another mock (e.g. `content/mock4/maths.json`, `content/mock2/english.json`, `content/mock4/ga.json`) to match the style and depth. Do NOT copy those questions; list their texts first so yours do not repeat concepts/numbers/facts that already appear in the same section in other mocks.

## Output
- Write one file per section: `content/mock<N>/<section>.json`, shape `{ "section": "<key>", "passages": {...}, "questions": [ ... ] }`. Exact counts: maths 30, reasoning 30, english 45, ga 25, computer 20.
- Strict JSON, UTF-8, no comments/trailing commas. Plain Unicode maths (x², √, π, °, ×, ÷, −, ₹). No LaTeX, no HTML. Inline `**bold**` and `__underline__` are allowed in text/options/passages (underline marks the tested part of a sentence).
- Optional `table`: `{ "caption": "", "headers": [..], "rows": [[..]] }` (strings) for data-interpretation questions.
- Run `node server/scripts/validate.js content/mock<N>/<section>.json` and fix EVERY error before finishing. Warnings about answer-position skew or difficulty mix: fix them too.

## Quality bar (non-negotiable)
- Originality: new wording, new numbers, new scenarios. Same CONCEPTS and STYLE as recent Tier-II papers, never copied questions.
- Exactly one defensible correct answer. No "all of the above" unless essential. Options distinct, plausible, built from real common errors (the SSC trap style: result of using the wrong formula, forgetting a step, sign slip, close values).
- Every maths question (and every computable reasoning one) needs `value` + `check` (an independent JS expression). Do the arithmetic in a Python/Node script you actually run and print a verification table. Wrong keys are the single worst defect, so verify before writing the explanation.
- Reasoning puzzles/series/coding/blood relation/direction/calendar/clock: verify with a brute-force script where possible (enumerate all arrangements to prove a unique solution). Text-only: no figure/image questions; describe dice/cubes/grids in words.
- GA / Computer: ONLY facts you are certain about and that are stable. No events after 2023, no "latest"/"current" holders, no record statistics that change. If unsure, pick a different fact. Avoid disputed or oversimplified science claims.
- English: grammar items need a single clear governing rule; vocabulary items need unambiguous standard-dictionary meanings; passages are original (150-220 words for moderate mocks, 250-330 for hard) and every RC answer must be directly supported by the text. Hard English = subtle error spotting, close synonyms, inference/tone questions, not obscure trivia.
- `explanation`, `steps` (real working with actual numbers, 2-6 steps), `trap`, `revise`, `approach`, `wrongReasons` must be specific to the question — no template filler ("Identify the concept"). `wrongReasons` is an array of 4: `null` at the correct index, otherwise a ≤15-word reason that option tempts.
- `shortcut`: include when a genuinely faster method exists (most maths/reasoning ones should have one).
- Difficulty labels must be honest. Moderate mocks (1,2): about 25% easy / 55% moderate / 20% hard within your file. Hard mocks (3,4,5): about 10% easy / 40% moderate / 50% hard. Hard means multi-step, two concepts combined, closer distractors, longer set-up — never "obscure".
- Correct answer index spread across 0-3 (each 20-30%). Don't always put the longest option as correct.
- Final reply: 3-6 lines only — file(s) written, validator result, and anything you had to deviate on. Do not paste the questions.


## Amendment (owner decision): General Awareness includes current affairs
- Each GA file carries 5 of its 25 questions as CURRENT AFFAIRS (events/appointments/awards/schemes/sports/summits from Jan 2024 – Oct 2026). Set `"currentAffairs": true` and `"asOf": "YYYY-MM"` on those questions. They count inside the 25 (topic "Current Affairs", subtopic e.g. "Awards", "Sports", "Summits", "Schemes & Budget", "Appointments").
- Verify EVERY current-affairs fact with WebSearch (at least one reliable source, preferably two) before writing it; today is 2026-11-04. Use only settled facts (completed events, announced results). No "current holder of X" that may change soon unless the explanation states "as of <month year>". Drop any fact you cannot confirm. Put the source domain(s) in the question's `"source"` field (string).
- This overrides "No events after 2023" in the rules above for those 5 questions only; the other 20 stay static.

## Amendment 2 (owner decision): calibration = real Tier-II level, slightly harder
- Target: AT PAR with the Tier-II Paper-I questions of the last three cycles (CGL 2022 Tier-II, 2023 Tier-II held Oct 2024, 2024 Tier-II held Jan 2025), and a notch HARDER overall. Real Tier-II is not Tier-I: Maths is calculation-heavy with 2-3 step problems (frustum/cone/sphere melting, trig identities with powers, circle/triangle-centre geometry, successive discounts with profit, pipes with leaks, boats, DI-in-text); Reasoning has dense verbal/analytical sets, statement-assumption, data sufficiency; English has long RC/cloze and subtle error spotting; GA mixes polity/economy/geography/history/science with current affairs.
- So even the "moderate" mocks (1-2) must read like an average real Tier-II shift (not like Tier-I); the "hard" mocks (3-5) should feel like the toughest real shifts plus ~10%. Keep the difficulty labels honest and the validator mix.
- Before writing, run 2-3 WebSearch queries (e.g. "SSC CGL Tier 2 2024 maths questions asked analysis", "CGL Tier 2 reasoning topics weightage 2024") to refresh the topic/style picture, and let it shape topic choice. Original questions only; never reproduce actual paper questions.
- No question may need an image. Every answer must be provable from your own explanation.
