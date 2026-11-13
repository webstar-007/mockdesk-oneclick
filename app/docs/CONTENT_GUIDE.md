# Content guide – how questions are authored

Each mock has one JSON file per section: `content/<mockId>/<section>.json`
(`maths`, `reasoning`, `english`, `ga`, `computer`). Section sizes, marks and
negative marking come from `config/exam.config.js` – never hard-code them in
question files.

## File format

```json
{
  "section": "maths",
  "passages": { "p1": "Shared text for set-based questions (RC, cloze, puzzles)…" },
  "questions": [
    {
      "topic": "Arithmetic",
      "subtopic": "Profit & Loss",
      "difficulty": "moderate",
      "text": "A trader marks an article 25% above cost price and allows a discount of 12%. If he still earns ₹ 1,260 as profit, what is the cost price (in ₹)?",
      "options": ["10,800", "12,600", "14,000", "11,200"],
      "answer": 1,
      "value": 12600,
      "check": "1260 / (1.25 * 0.88 - 1)",
      "explanation": "Selling price is 1.25 × 0.88 = 1.10 of cost price, so profit is 10% of CP.",
      "steps": ["SP = 125% of CP × 88% = 110% of CP", "Profit = 10% of CP = 1,260", "CP = 1,260 ÷ 0.10 = ₹ 12,600"],
      "shortcut": "Net effect: 1.25 × 0.88 = 1.10, so profit% = 10 straight away (optional field).",
      "trap": "Subtracting 12% from 25% to get 13% profit.",
      "revise": "Successive percentage changes / discount on marked price",
      "approach": "Convert marked price and discount into one multiplier on CP, then equate to the given amount (optional).",
      "wrongReasons": ["Used 11.67% profit", null, "Used profit% = 25 − 12 + 1", "Used 12.5% profit"],
      "passageId": "p1"
    }
  ]
}
```

### Fields
| field | required | notes |
|---|---|---|
| topic, subtopic | yes | topic = chapter family (e.g. *Arithmetic*), subtopic = specific (e.g. *Profit & Loss*) |
| difficulty | yes | `easy` / `moderate` / `hard` |
| text | yes | plain text, `\n` for line breaks. Use ₹, °, √, ², ³, π, ≤ ≥ directly as Unicode. |
| options | yes | exactly 4 strings |
| answer | yes | index 0-3 of the correct option |
| explanation | yes | 1–3 sentences: why the right option is right |
| steps | maths, reasoning | array of short step strings (optional elsewhere) |
| shortcut | optional | only when a genuinely faster method exists |
| trap | yes | the common mistake that makes students pick a wrong option |
| revise | yes | concept/chapter to revise |
| approach | optional | recommended approach for similar questions |
| wrongReasons | yes | array of 4: for each WRONG option a ≤15-word reason a student would have chosen it / why it fails; `null` at the correct index |
| value + check | maths (≥80%) and any computable reasoning | `check` = JavaScript expression (Math.* allowed) that *independently* computes the numeric answer; `value` = the number in the correct option. The validator evaluates it and fails on mismatch, and fails if another option also contains the value. |
| currentAffairs, asOf, source | GA only | current-affairs questions (5 per GA file): `currentAffairs:true`, `asOf:"YYYY-MM"`, `source:"domain, domain"`; each fact must be verified on the web before it is written |
| table | optional | `{caption, headers[], rows[][]}` for data-interpretation questions (text only, no images) |
| passageId | set-based | key into `passages` (RC, cloze, puzzle set, para-jumble not needed) |

No figure/diagram-dependent questions (platform is text-only): use text-described
reasoning only. No time-sensitive current affairs (cannot be verified later).

## Section blueprints (derived from Tier-II Paper-I trends 2022-24 + 2026 pattern)

**Maths (30)** – Arithmetic 13: Percentage 2, Profit-Loss-Discount 2, Ratio/Mixture/Alligation 2,
Time-Work-Pipes 2, Time-Speed-Distance incl. trains/boats 2, SI/CI 1, Average/Age 1, Number system 1.
Algebra 5 (identities, surds/indices, linear eq., max–min, polynomials). Geometry 6 (triangle centres,
similarity/congruence, circles, polygons, in/circum-radius). Mensuration 3 (cylinder/cone/sphere/combos).
Trigonometry 3 (identities, heights & distances, values). Hard mocks (3-5) may swap up to 2 questions for
table-in-text Data Interpretation (topic "Data Interpretation").

**Reasoning (30)** – Analogy 3, Classification 3, Series 3, Coding-Decoding 3, Blood Relations 2,
Direction & Distance 2, Order & Ranking 2, Syllogism/Venn 2, Seating/Puzzle 4 (two sets of 2 with `passages`),
Mathematical Operations 2, Missing Number 2, Inequalities 1, Calendar/Clock 1.

**English (45)** – Reading Comprehension 12 (3 passages × 4, 130-200 words each, original), Cloze test 5
(one passage with blanks numbered (1)…(5); each question asks for one blank), Error spotting 5,
Sentence improvement 4, Fill in the blank 2, Synonyms 3, Antonyms 2, Idioms & phrases 3,
One-word substitution 2, Spelling error 2, Para-jumbles 3, Active/Passive 1, Direct/Indirect 1.

**General Awareness (25)** – History 5, Polity 4, Geography 4, Economy 3, Science 8
(Physics 3, Chemistry 2, Biology 3), Static GK 1. Static, settled facts only.

**Computer (20)** – Fundamentals/hardware 4, MS Office 4, Internet & networking 4,
Security & malware 3, OS & software 3, Memory/storage/number systems/gates 2.

## Difficulty targets
Moderate mocks (1-2): ≈25% easy / 55% moderate / 20% hard.
Hard mocks (3-5): ≈10% easy / 40% moderate / 50% hard.
Hard means: 3+ step calculations, unit/percentage traps, "NOT/EXCEPT" stems, close distractors,
dense puzzles (6-8 entities), near-synonym vocabulary, statements where two facts look alike.

## Quality rules
* Original questions only – same concepts and style as past papers, never copied.
* Exactly one defensible answer. Drop any question you cannot prove from the explanation.
* Distractors must be what a student would genuinely get from a typical mistake.
* Balance answer positions (no index > 40%).
* English: avoid contested usage; each error/improvement item must have one clear rule behind it.
* GA/Computer: only widely settled facts you are certain of; prefer facts that stay true.
* Every mock must feel different: use the per-mock emphasis below so mocks do not repeat content.

## Per-mock emphasis (avoids cross-mock repetition)
| mock | GA history | GA polity | GA geography | GA economy | Science chapters | Computer emphasis | Vocab words begin with |
|---|---|---|---|---|---|---|---|
| 1 | Indus, Mauryas, Guptas, 1857, Non-Cooperation | Preamble, Fundamental Rights | Rivers, physiography | Banking, RBI | Motion & force, acids/bases, cell biology | Basics, generations, hardware, Office shortcuts | A–E |
| 2 | Vedic, Sangam, Delhi Sultanate, Acts of British, Civil Disobedience | DPSP, Duties, Amendments | Climate, soils | Budget, taxes, GDP | Light & sound, metals/non-metals, human body | Internet, networking, protocols | F–L |
| 3 | Buddhism/Jainism, Mughals, Marathas, social reform, Quit India | Parliament, President | Agriculture, minerals, industries | Planning, poverty, employment | Heat & electricity, carbon compounds, plant physiology | Security, DBMS, malware | M–R |
| 4 | Kushanas, Satavahanas, Bhakti/Sufi, Vijayanagara, Viceroys, Partition | Judiciary, Governor, State | World geography, oceans | Inflation, money, financial markets | Work-energy, chemical reactions, diseases/nutrition | OS, software types, number systems | S–Z |
| 5 | Cholas/Pallavas, art & architecture, Moderates–Extremists, tribal revolts, INA | Emergency, Commissions, Elections, Panchayati Raj | National parks, latitudes, Indian states | International trade, agri-economics, schemes | Gravitation, atomic structure, genetics/ecology | Mixed hard, logic gates, shortcuts | Mixed A–Z (rarer words) |

## Content status (audited 10 Nov 2026)

- All five mocks are complete and live: 150 questions each (Maths 30, Reasoning 30, English 45, GA 25, Computer 20), zero validation errors.
- Every question has an explanation, numbered solution steps, a common mistake, a concept to revise and a reason for each wrong option.
- Current-affairs facts in GA (Jun 2025 to Nov 2026) were checked against web sources and carry `currentAffairs`, `asOf` and `source`. Each fact is used in one mock only. The FIFA 2026 final score was not confirmed, so only the winner and finalists are stated.
- Reasoning figure items (mirror image, water image, paper fold, Venn, counting squares, counting triangles, dice) use different values or categories in each mock.
- After changing question text or steps, rebuild nothing: banks are read at server start. After changing `src/`, run `npm run build` (the start script does this when `dist` is older than `src`).
- Known: Mock 2 Maths is harder than its "moderate" label; this is accepted.

### Current affairs refresh (10 Nov 2026)
Each mock's GA section now carries at least 5 current-affairs items from May-Nov 2026 (Nobel 2026, IPL 2026, International Booker 2026, French Open/Wimbledon/US Open 2026, Asian Games 2026, Norway Chess, 100th Ramsar site, FATF VP, SCO Bishkek, G7 Evian, archery World Cup Final, World Bank ED, RBI Oct 2026, CWG, FIFA WC, BRICS, GDP Q1, May 2026 state elections). Each fact appears in one mock only. Older items remain as static-GK-linked questions. Exam flow (start, answer, mark, leave and resume, section submit, results) was re-tested in a browser for all five mocks with no errors. Note: attempts snapshot questions, so already-started attempts keep old content.

### Home page redesign (10 Nov 2026)
`src/pages/Dashboard.jsx` + `src/styles/home.css` (classes `hm-*`): gradient hero with one-click start/resume of the next mock, progress rings, icon KPI cards, exam-pattern strip (from `config/exam.config.js`), mock cards with difficulty meter, "Up next" badge and best-score bar, exam-day playbook with a "Focus next" tip, then the existing progress charts and history. Supports dark mode and phones. Run `npm run build` after editing `src/`.

### Multi-exam home page (10 Nov 2026)
The brand is now just "MockDesk". Exams are listed in `src/lib/exams.js` and shown as tabs on the home page (a "+ More exams soon" chip trails the list). Added after reviewing Testbook, Oliveboard, Adda247 and PW layouts: exam switcher, status filters with counts, a "Why MockDesk" strip, an FAQ, and a site footer. Rank and percentile are not included because they need many users' data.

### UI polish (10 Nov 2026)
New sign-in and sign-up design (`src/styles/auth.css`), show/hide password, exam-countdown chip on the home page (from the exam date in Profile), spacing pass on the home page, removal of repeated Computer-test chips and duplicate FAQ items, and README refresh including how to add another exam.

### OTP sign-in (10 Nov 2026)
Email and mobile OTP sign-in were added (`server/lib/otp.js`, `/auth/otp/*`, `.env.example`). Delivery needs your own SMTP / Twilio / MSG91 account; see the README. Note: password sign-up does not verify the email address.

### Theme, cockpit and analysis (10 Nov 2026)
Added a dark/light toggle (`src/lib/theme.js`, `data-theme` on `<html>`), the home-page cockpit (`src/components/Insights.jsx`), a richer result page (`src/lib/analysis.js`) and a rebuilt review page. The FAQ was removed from the home page. No question-bank changes.

### Sign-in redesign (10 Nov 2026)
One input for mobile or email OTP (channel auto-detected), 6-box code entry with auto-verify, simpler layout, form resets between sign-in and sign-up. API unchanged.

### Sign-in redesign (10 Nov 2026)
Sign-in and sign-up are now one centred card with a Sign in / Create account switch; the side marketing panel and stat boxes were removed. Styles: `src/styles/auth.css`.

### QA pass (10 Nov 2026)
End-to-end check of tests, exam flow and all pages at phone, tablet and desktop widths in light and dark. Fixes: mock cards now show 150 questions (130 scored + 20 Computer), spacing under the locked insights, a "more mocks" placeholder card, clearer profile hints.

### Second QA pass (11 Nov 2026)
Larger tap areas for inline links (footer, history actions, back links), full-width filters on the mobile review page, and the "Habits" card on the result page now spans the full width. No content changes.

### Profile and sign-in (11 Nov 2026)
Profile rebuilt (`src/pages/Profile.jsx`, `src/styles/profile.css`); sign-in page got a labelled Light/Dark switch, a centred brand and more generous spacing.

### Mobile reading size (11 Nov 2026)
Question, option and passage text enlarged on phones (question 19.5 px, options 17.6 px).

### Exam toolkit (11 Nov 2026)
New `/toolkit` page (`src/pages/Toolkit.jsx`, `src/styles/toolkit.css`). It reads sections, marks and timers from `config/exam.config.js`, so it follows pattern changes. The checklist text lives in `CHECK` in Toolkit.jsx; re-check it against the official admit card and notice each cycle.

### Home page review (11 Nov 2026)
Fixed the study-plan checkbox layout and the wide streak map; removed the duplicate score-comparison chart (the trajectory shows the same) and moved Weakest topics into the cockpit; added toolkit shortcut tiles.

### PDF report, blueprint and instructions redesign (11 Nov 2026)
PDF export (`server/lib/pdf.js`), new exam blueprint (`src/components/Blueprint.jsx`) and a redesigned instructions page. Question diagrams are drawn into the PDF from the same SVG, so keep figures within the allowed SVG tags.
