# SheetEX — Spreadsheet Explorer (v2)

> **v2** adds the **Data Wrangling Lab** with an **🤖 AI Readiness Check**, an **Interactive Cheat Sheet**, an
> **interactive "What is an RDBMS?" page**, **9 lessons with guides and certificates**, a **teacher guide with a verified answer key**, and an optional
> **class gradebook + cloud save** through Google Apps Script. v1 is preserved on its own branch.

A classroom simulator that teaches students **why a formula that works at school breaks at home**.
The same store data (Peachtree Supply Co. — products, sales, stores) lives in five tools, and each
one behaves like the real thing, errors included:

| Workspace | What students learn |
|---|---|
| **Excel 365** | Dynamic arrays and spilling, `#SPILL!`, XLOOKUP, FILTER, SORT, UNIQUE, LET, IFS, the `A2#` spill operator |
| **Excel 2013** | Modern functions give `#NAME?`; nested IFs, INDEX/MATCH, `VLOOKUP(…, FALSE)`, **Ctrl+Shift+Enter** array formulas `{=MAX(IF(…))}`, and the wrong answers you get without it (implicit intersection) |
| **Google Sheets** | `FILTER`/`SORT` take different arguments, `SORT(…, -1)` silently sorts the wrong way, `CONCAT` takes only 2 values, `ARRAYFORMULA`, `QUERY`, `SPLIT`, `REGEXMATCH`, open ranges like `E2:E`, `#ERROR!` instead of a pop-up |
| **CSV / TSV** | Files store values only. Formulas and formatting vanish on export, commas need quotes, quotes get doubled, and spreadsheets mangle `05401` and 16-digit IDs on open |
| **SQL** | WHERE = FILTER, GROUP BY = SUMIF, JOIN = VLOOKUP, HAVING, integer division (`7/2 = 3`), case-sensitive text, UPDATE without WHERE |
| **Data Wrangling Lab** (v2) | Cleaning a messy order feed before an AI model sees it. Item codes that lost their zeros (`104` vs `"0104"`), text that looks like numbers, four date formats plus a European `03.09.2026`, blanks vs fake nulls (`N/A`, `-`, `null`), messy names and store codes, `$` prices stored as text. Then VLOOKUP/HLOOKUP/XLOOKUP joins, why lookups return `#N/A` (number vs text), concatenation, delimiters, TEXTJOIN, and FILTER around missing values. Runs on an Excel 365 **or** Google Sheets engine (switch at the top) |
| **What is an RDBMS?** (v2) | A hands-on page: change one copy of a price in a flat sheet and watch an *update anomaly* appear, then fix it with one `UPDATE`; click columns to see types and keys; follow an order through an ER diagram (foreign key → primary key); press buttons that try duplicate keys, missing names, negative prices, text in a number column and orphan rows, and watch the database refuse each one; move lunch money between two accounts and pull the plug mid-transfer, with and without a transaction (ACID). Ends with a free-play SQL sandbox |
| **Interactive Cheat Sheet** (v2) | 33 everyday data tasks ("pad leading zeros", "count fake nulls", "split at a delimiter", "why does my lookup say #N/A?") with the answer for Excel 365, Excel 2013, Google Sheets, SQL and CSV side by side, plus a **▶ Run** button that runs it live on the Peachtree data |

Students start on a home page, pick a workspace, and earn **XP**, **levels** (Intern → Chief Data Officer)
and **badges**. Every workspace has a free-play sandbox plus a side panel with:

- **🏆 Challenges** — 81 auto-checked challenges with progressive hints, grouped into 9 lessons. A hint costs 20% of that challenge's XP.
- **📘 Cheat sheet** — what is different on this platform, keyboard shortcuts, a searchable function list using *that* platform's argument names, and error codes.
- **🌐 Will it work elsewhere?** — runs the selected cell's formula in Excel 365, Excel 2013 and Google Sheets on the same data, shows each result, and writes the rewrite (for example XLOOKUP → `IFERROR(INDEX(…, MATCH(…, 0)), …)`, or MAXIFS → `{=MAX(IF(…))}`). One click applies the fix.

Other details: students collect all 9 error types (`#NAME?`, `#VALUE!`, `#REF!`, `#DIV/0!`, `#N/A`, `#NUM!`, `#SPILL!`, `#CALC!`, `#ERROR!`) for XP. There is also a **Compare** page with a formula playground, a function-availability matrix, and a spreadsheet → SQL dictionary.

## 🤖 AI Readiness Check (v2)

A tab in the Data Wrangling Lab that "trains" the simplest possible model — average units per order for each
store — twice: once on the raw feed (the way a careless import would read it) and once on the student's own
cleaned columns. A dot plot compares both with the true averages. On the raw data the model invents **13 stores
instead of 5** (`"s04"`, `" S02 "`…), reads 12 messy quantities as 0, and is off by about **5 units per store**.
As students clean each column, a 0–100 readiness score climbs and their model's dots land on the truth (0.0 off).
Real models are far more complex, but the lesson is the same: garbage in, garbage out.

## Lessons and certificates (v2)

| # | Lesson | Workspace |
|---|---|---|
| 1 | Spreadsheet Foundations | Excel 365 |
| 2 | Classic Excel & Nested Functions | Excel 2013 |
| 3 | Google Sheets Survival Guide | Google Sheets |
| 4 | Data Files: CSV & TSV | CSV / TSV |
| 5 | Data Wrangling I: Cleaning Data for AI | Data Wrangling Lab |
| 6 | Data Wrangling II: Combining & Lookups | Data Wrangling Lab |
| 7 | SQL for Data Analysts | SQL |
| 8 | Cross-Platform Translator | Compare |
| 9 | What is an RDBMS? | RDBMS page (tables, keys, constraints, transactions) |

Every lesson has a **📖 guide** (why it matters, vocabulary with examples, common traps) that opens the first time a
student enters its workspace and from the challenge panel or home page.

Finishing every challenge in a lesson unlocks its **certificate**: the student's full name, the lesson, the skills
covered, challenges completed, XP earned, hints used, the date, and a verification ID. Students can turn it in three ways:

1. **🖨 Print / Save as PDF** (prints only the certificate, one landscape page)
2. **⬇ Download image** (PNG; if a school site blocks downloads, the image appears on screen to right-click → Save)
3. **📋 Copy certificate code** (`SXC1-…`) to paste into a Canvas text submission

To check codes, click **?** → *For teachers* and paste a whole class's codes (certificate and progress codes can be mixed).

## Teacher guide (v2)

`npm run build` also writes **`dist/teacher-guide.html`** (and `dist/SheetEX-Teacher-Guide.pdf` is committed):
pacing (about 10 class periods), objectives, misconceptions, vocabulary, discussion questions, exit tickets, and the
**answer key for all 81 challenges**. The answer key lives in `src/teacher/solutions.js`; the test suite checks every
answer against the real auto-checkers (Wrangling answers in both Excel 365 and Google Sheets), so the key cannot drift
from the app. The answers are never included in the student app — the build fails if they leak.

## Class gradebook and cloud save (optional, v2)

When SheetEX runs from your Apps Script deployment, it can also write to a Google Sheet in **your** Drive:

- **Certificates tab:** every certificate earned is recorded automatically (time, student, lesson, XP, hints, code). No codes to collect.
- **Saves tab:** students click their name → *Class cloud save*, then save or load with **first + last name and a 4–8 digit PIN**. That carries XP, challenges and certificates to another day or computer. The work inside the spreadsheets stays on the device.

Setup: deploy as below. The first time, Apps Script asks you to allow access to Google Sheets and Drive, because the
script creates and writes the gradebook as you. The gradebook (**SheetEX Gradebook**) is created the first time a student earns a certificate or saves.
To create it right away and get its link, select `setup` in the Apps Script editor's function menu and click **Run**.
The link appears in the execution log.

When the app is opened anywhere else (a local file, GitHub Pages), the cloud features hide themselves and everything else works the same.

## Deploy on Google Apps Script and embed in Canvas

`apps-script/` holds everything Apps Script needs. The whole app is **one self-contained file**
(`apps-script/Index.html`, ~410 KB) with no outside requests, so school web filters cannot break it.

1. Go to <https://script.google.com> → **New project**. Name it `SheetEX`. (Updating from v1? Replace both files, then do step 4's *New version* deploy.)
2. Replace everything in `Code.gs` with the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
3. Click **＋ → HTML**, name the file exactly `Index` (Apps Script adds `.html`), and paste in the whole
   contents of [`apps-script/Index.html`](apps-script/Index.html).
4. **Deploy → New deployment →** type **Web app**.
   - *Execute as:* **Me**
   - *Who has access:* **Anyone** (or **Anyone within your school domain** if your district requires it — students then need to be signed in to their school Google account)
5. Click **Deploy**, approve the permissions prompt, and copy the **Web app URL** (it ends in `/exec`).
6. In Canvas, edit a Page → **HTML Editor**, and paste:

   ```html
   <iframe src="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
           width="100%" height="820" style="border:0" allow="clipboard-write"
           title="SheetEX"></iframe>
   ```

**Updating later:** paste the new `Index.html`, then use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
That keeps the same URL, so the Canvas embed does not change.

`Code.gs` sets `XFrameOptionsMode.ALLOWALL`, which is what allows Canvas to show it in an iframe.
If you use a personal Gmail account (not Workspace), Google shows a small "created by a Google Apps Script user" banner above the app. That is normal.

### Saving progress and grading

- Work and XP save automatically in the student's browser (`localStorage`). On a school Chromebook that stays with the student's login.
- If a browser blocks saving, the home page warns the student. Everything still works for that session.
- **Progress codes:** students click their name → **Copy code** and paste it into a Canvas text submission. A code holds name, XP, completed challenges, badges and errors found. It is checksummed, so hand-edited codes show as invalid. The same code restores progress on another computer.
- **Teacher view:** click **?** → *For teachers: check a class set of progress codes* and paste in all the submissions at once to see a table of the whole class.

## Other ways to run it

- **Any static host / GitHub Pages:** serve `dist/index.html`.
- **Locally:** open `dist/index.html` in a browser.

## Development

Plain JavaScript, no frameworks, no runtime dependencies.

```
src/
  index.html          page template
  css/styles.css      all styles, including the three app "chromes"
  js/data.js          the store dataset (deterministic)
  js/formula.js       values, lexer, parser, printer, reference shifting
  js/engine.js        evaluator + ~115 functions, with per-platform availability and argument rules
  js/workbook.js      cells, recalculation, spilling, circular refs, formats, undo, copy/paste
  js/sql.js           SQLite-style SQL engine (also powers Google Sheets QUERY)
  js/platforms.js     platform descriptions, cheat-sheet text, cross-platform translator
  js/csv.js           CSV/TSV parse/write/export and "what a spreadsheet does on open"
  js/challenges.js    the challenge bank and its auto-checkers
  js/wrangle.js       v2: the messy order feed (generated from clean "truth" records) + expected answers
  js/lessons.js       v2: lesson list and certificate codes
  js/reference.js     v2: interactive cheat sheet data + live runner
  teacher/            v2: answer key, discussion/exit tickets, teacher-guide generator (never shipped to students)
  js/ui-*.js          home page, XP/badges, spreadsheet grid, CSV editor, SQL console, Compare page
build.js              inlines everything into dist/index.html and apps-script/Index.html
tests/                node:test suites + a Playwright browser smoke test
```

```bash
npm run build          # writes dist/index.html and apps-script/Index.html
npm test               # engine behaviour, every challenge solvable (wrangling in BOTH Excel 365 and Sheets),
                       # every cheat-sheet example runs, certificate codes, Code.gs against Apps Script mocks
npm run test:browser   # Playwright smoke test (every workspace + a locked-down iframe with no storage)
npm run test:e2e       # completes EVERY lesson through the real UI (typing formulas, Ctrl+D, Ctrl+Shift+Enter,
                       # the CSV editor, the SQL console) and confirms each certificate unlocks
npm run test:monkey    # 1,500 random/hostile actions across all workspaces: no errors, nothing slow
```

After editing anything in `src/`, run `npm run build` and paste the new `apps-script/Index.html` into Apps Script.

### Adding a challenge

Add an entry in `src/js/challenges.js` (`plat`, `title`, `xp`, `task`, `hints`, `learn`, and either
`check(h)` or `type: 'quiz'` with `options`/`answer`). Then add its reference solution to
`tests/challenges.test.js`. The test suite fails if any challenge cannot be solved.

## Honest limits

- **Certificate and progress codes are tamper-*evident*, not tamper-*proof*.** They catch casual editing, but a determined student who reads the source could forge one. The same goes for the gradebook: a tech-savvy student could call the save function directly. Treat both as strong evidence of completion, not cryptographic proof — the same level of trust as a screenshot.
- **Cloud save PINs** protect against classmates loading each other's progress by accident. A 4-digit PIN is not a password, and saves hold only XP and challenge progress (no personal data beyond the name).
- **One sitting is not required:** progress stays in the browser on the same device/login, and cloud save or progress codes move it anywhere.

## Accuracy notes

SheetEX copies how each app behaves for the ~115 functions it supports. It is not the real software,
and the real apps have hundreds more functions. Behaviors it models: function availability by version,
argument differences, array evaluation (dynamic arrays vs Ctrl+Shift+Enter vs ARRAYFORMULA),
implicit intersection, spilling and `#SPILL!`, approximate-match VLOOKUP, blank-cell display,
parse-error handling, and SQLite typing rules. The SQL engine enforces PRIMARY KEY, UNIQUE, NOT NULL, CHECK,
DEFAULT, FOREIGN KEY and `STRICT` tables, and supports `BEGIN`/`COMMIT`/`ROLLBACK` and `PRAGMA table_info`. One deliberate
difference: foreign keys are enforced by default (like PostgreSQL and MySQL); real SQLite needs `PRAGMA foreign_keys = ON;`,
which SheetEX also accepts (and `= OFF` to show what happens without it). Edge cases can differ, so when something matters,
check it in the real app — which is the habit this project is trying to build.

SheetEX is not affiliated with Microsoft or Google. Product names identify the software being taught.
