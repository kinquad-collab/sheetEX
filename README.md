# SheetEX — Spreadsheet Explorer (v2)

> **v2** adds the **Data Wrangling Lab** with an **🤖 AI Readiness Check**, an **Interactive Cheat Sheet**, an
> **interactive "What is an RDBMS?" page**, an **ML Data Lab**, a **Data Tools Lab** (working menus, pivot tables and charts), **12 lessons with guides, no-hints certification tests and
> certificates**. Everything runs from one Google Apps Script page. **No student data is collected**: everything stays in the
> student's browser and in one sealed **progress file** (`.json`) the student saves. v1 is preserved on its own branch.

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
| **Data Tools Lab** (v2) | The **menus** students use at home and at work, in Excel 365, Excel 2013 or Google Sheets, on a messy order export: Sort (and the one-column trap), Filter with SUBTOTAL, Find & Replace, Paste Values, Remove Duplicates, Trim whitespace, Text to Columns / Split, Data Validation, Conditional Formatting, **pivot tables** (rows, columns, values, filter; Excel's Refresh vs Sheets' automatic updates) and **charts** (column, bar, line, pie, scatter, with an axis-starts-at-0 switch) |
| **ML Data Lab** (v2) | Getting a database table ready for a machine-learning model: examples, features and the label; class imbalance and a "lazy baseline" that beats the real model on accuracy; missing values (drop, fill, flag); test rows that are copies of training rows; a column that leaks the answer from the future; building the training table with `CREATE TABLE … AS SELECT` and a JOIN; grading the model with accuracy, precision, recall and a clickable confusion matrix |
| **Interactive Cheat Sheet** (v2) | 33 everyday data tasks ("pad leading zeros", "count fake nulls", "split at a delimiter", "why does my lookup say #N/A?") with the answer for Excel 365, Excel 2013, Google Sheets, SQL and CSV side by side, plus a **▶ Run** button that runs it live on the Peachtree data |

Students start on a home page, pick a workspace, and earn **XP**, **levels** (Intern → Chief Data Officer)
and **badges**. Every workspace has a free-play sandbox plus a side panel with:

- **🏆 Challenges** — 117 auto-checked practice challenges with progressive hints, grouped into 12 lessons. A hint costs 20% of that challenge's XP.
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
| 9 | Databases 101: What is an RDBMS? | RDBMS page (tables, keys, constraints, transactions) |
| 10 | Databases for Machine Learning | ML Data Lab |
| 11 | Sort, Filter & Clean with the Menus | Data Tools Lab |
| 12 | Pivot Tables & Charts | Data Tools Lab |

Every lesson has a **📖 guide** (why it matters, vocabulary with examples, common traps) that opens the first time a
student enters its workspace and from the challenge panel or home page.

### The menus (v2)

Every spreadsheet workspace has working **Data**, **Insert** and **Home** menus (Excel) or **Edit**, **Insert**, **Format**
and **Data** menus (Google Sheets), named the way each app names them. They are deliberately simple — plain dialogs, no
dragging — but they keep the behaviors that really differ between the apps:

| Tool | Excel 365 / 2013 | Google Sheets |
|---|---|---|
| Sort | *Sort Warning* when you select one column of a table ("Expand the selection?") | *Sort range* sorts only what you selected; *Sort sheet* moves row 1 too when nothing is frozen |
| Remove duplicates | Data ▸ Remove Duplicates · "N duplicate values found and removed" | Data ▸ Data cleanup ▸ Remove duplicates |
| Trim spaces | no button — `=TRIM()` then Paste Values | Data ▸ Data cleanup ▸ Trim whitespace |
| Data validation | refuses bad typing (Stop); existing/pasted data needs *Circle Invalid Data* | warns by default (red corner), can reject; existing data is marked |
| Conditional formatting | has a *Duplicate Values* preset | no duplicates preset — *Custom formula is* `=COUNTIF(…)>1` |
| Pivot tables | new sheet "Sheet1", *Row Labels* / *Sum of Qty*; **stale until Refresh** | new sheet "Pivot Table 1", *SUM of Qty*; **updates automatically** |
| Filter | status bar "5 of 24 records found" | "showing 5 of 24 rows" |

`SUBTOTAL` is supported and skips filtered-out rows, so students can see why `SUM` gives the wrong total on a filtered list.
Charts appear in a **📊 Charts** panel and update with the data; the panel warns about common chart mistakes (pie with too
many slices, axis not starting at 0, numbers stored as text, scatter without numeric X).

### Practice, then a certification test

Practice challenges have hints whenever a student is stuck. When every practice challenge in a lesson is done, the
lesson's **certification test** unlocks:

- **10 questions drawn at random** from that lesson's bank (12–18 per lesson, **185 in total**), **half of them hands-on**. **8 of 10 to pass.**
- **No hints and no cheat sheet.** The test covers the whole screen.
- **Hands-on questions are run, not pattern-matched.** A formula answer is evaluated by the same engine as the workspace, both on the
  real data and on a shuffled copy (rows reversed, numbers changed). Any correct formula is accepted, and the app's quirks still
  apply: `XLOOKUP` is `#NAME?` on an Excel 2013 question, an array formula needs Ctrl+Shift+Enter, and `SORT(…, -1)` sorts the
  wrong way in Google Sheets. Typing the answer as a number, or pointing at the one cell that holds it, does not match.
  SQL answers are run on a fresh database and on a changed copy; `CREATE TABLE` answers are graded by what the table
  accepts and refuses; CSV answers are parsed the way a program reads them.
- **The answers are not in the app.** It holds only fingerprints (hashes) of each correct result. The answers live in
  `src/banks/questions.js`, which is never shipped.
- **An attempt counts as soon as it starts.** Closing or reloading the page counts as a failed attempt, a failed attempt
  has a 2-minute review break, and results show which *topics* were missed, not the answers.

Passing earns the **certificate**: the student's locked name, the lesson, the skills covered, the **test score**, the
**attempt number**, practice challenges done, hints used in practice and the date. Students can **🖨 print / save it as a
PDF** or **⬇ download an image**. The proof behind every certificate is the progress file.

### One progress file: the proof and the way back

- On the first visit a student types a **first and last name**, sees it large on a confirmation screen, and locks it in.
  After that it **cannot be changed**, even by the student. A misspelled name means *Erase everything and start over*.
- Clicking their name ▸ **⬇ Download my progress file** saves `SheetEX-First-Last.json`. That one file holds the name, XP,
  every challenge, every test result, every certificate **and all of their work** (spreadsheets, SQL database, CSV files).
- **Loading it puts them straight back where they were**, on any computer: on the welcome screen, *Coming back? Load your
  progress file*. A student whose name is already set **cannot** load someone else's file.
- The file is readable JSON with a summary at the top (name, level, XP, challenges, and each certificate with its test
  score, attempt and date), and it is **sealed (HMAC-SHA-256)** with a key made from a program key and a **class key** that
  belongs to your Apps Script deployment. SheetEX refuses the file if anything in it changes: a name, a score, one space or
  line break, the order of fields, an extra field, or a file made by any other copy of SheetEX.
- **To verify a file:** open the app, click **?** ▸ *Check a progress file (view only)*, and pick or paste the file. A genuine
  file shows **✓ Genuine** with its summary; an edited one is refused with the reason. Nothing is loaded or changed.
- If a school site blocks downloads, the file's text appears on screen with a **Copy** button, and the same text can be
  pasted back in to load or check it.

## Student data (FERPA)

SheetEX collects nothing. The Apps Script (`apps-script/Code.gs`, about 40 lines) only serves the page; it has no
gradebook, no cloud save, and no function the page can call. It does not use Sheets, Drive, Gmail, `UrlFetchApp` or
the user's identity (the test suite checks this). Progress lives in each student's own browser (`localStorage`), and
students decide what to turn in through Canvas. The only thing the script stores is the random class key, in the
project's Script Properties.

## Deploy on Google Apps Script and embed in Canvas

`apps-script/` holds everything Apps Script needs. The whole app is **one self-contained file**
(`apps-script/Index.html`, ~700 KB) with no outside requests, so school web filters cannot break it.

1. Go to <https://script.google.com> → **New project**. Name it `SheetEX`. (Updating from v1? Replace both files, then do step 4's *New version* deploy.)
2. Replace everything in `Code.gs` with the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
3. Click **＋ → HTML**, name the file exactly `Index` (Apps Script adds `.html`), and paste in the whole
   contents of [`apps-script/Index.html`](apps-script/Index.html).
4. **Deploy → New deployment →** type **Web app**.
   - *Execute as:* **Me**
   - *Who has access:* **Anyone** (or **Anyone within your school domain** if your district requires it — students then need to be signed in to their school Google account)
5. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`). The only permission it can ask for is storing its own
   class key in Script Properties.
6. **Open the URL once yourself.** That creates your class key. Check progress files in this same deployment (they are sealed to it).
7. In Canvas, edit a Page → **HTML Editor**, and paste:

   ```html
   <iframe src="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
           width="100%" height="820" style="border:0" allow="clipboard-write"
           title="SheetEX"></iframe>
   ```

**Updating later:** paste the new `Index.html`, then use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
That keeps the same URL, so the Canvas embed does not change, and the class key (Script Properties) stays the same, so
students keep their progress. **New semester:** select `newClassKey` in the editor and click **Run**. Every old progress
file and saved game stops being accepted.

**Upgrading from an earlier v2 with the gradebook:** replace *both* files. The new `Code.gs` has no gradebook functions.
The old *SheetEX Gradebook* sheet in your Drive is no longer used; delete it if your district requires. Saves and codes
from earlier versions are not accepted, so students start fresh once.

`Code.gs` sets `XFrameOptionsMode.ALLOWALL`, which is what allows Canvas to show it in an iframe.
If you use a personal Gmail account (not Workspace), Google shows a small "created by a Google Apps Script user" banner above the app. That is normal.

### Saving progress

- Work and XP save automatically in the student's browser (`localStorage`). On a school Chromebook that stays with the student's login.
- If a browser blocks saving, the home page warns the student. Everything still works for that session; the progress file carries it.
- To continue on another computer, students download their progress file, then on the new computer choose
  *Coming back? Load your progress file* on the welcome screen.

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
  js/lessons.js       v2: lesson list, guides and sealed certificate records
  js/seal.js          v2: SHA-256 + HMAC in plain JS; the class-key marker Code.gs replaces
  js/certtest.js      v2: certification-test engine (runs answers, fingerprints results, draws tests)
  js/sheettools.js    v2: sort, filter, remove duplicates, split, trim, find & replace, paste values, validation,
                      conditional formatting, pivot tables, chart data — plain functions shared by menus, checks and tests
  js/ui-sheettools.js v2: the menus, dialogs, grid decorations, pivot bar and Charts panel
  js/datatools.js     v2: Lessons 11–12 data (messy orders, monthly units, ad spend)
  js/mldata.js        v2: Lesson 10 data (ml_examples, predictions) with planted ML pitfalls
  banks/questions.js  v2: certification-test question banks WITH answers (never shipped; build ships fingerprints)
  banks/build-bank.js v2: runs every bank answer through the engine and turns it into fingerprints
  js/reference.js     v2: interactive cheat sheet data + live runner
  js/ui-*.js          home page, XP/badges, spreadsheet grid, CSV editor, SQL console, Compare page,
                      RDBMS page, ML Data Lab, certification test screen, certificates
build.js              inlines everything into dist/index.html and apps-script/Index.html
tests/                node:test suites, reference solutions for every practice challenge, Playwright browser tests
```

```bash
npm run build          # writes dist/index.html and apps-script/Index.html
npm test               # engine behaviour, every challenge solvable (wrangling in BOTH Excel 365 and Sheets),
                       # every cheat-sheet example runs, every test-bank answer accepted and common fakes rejected,
                       # sealed progress files/saves refuse tampering, names stay locked, Code.gs collects nothing
npm run test:browser   # Playwright smoke test (every workspace + a locked-down iframe with no storage)
npm run test:e2e       # completes EVERY lesson through the real UI (typing formulas, Ctrl+D, Ctrl+Shift+Enter,
                       # the CSV editor, the SQL console, the RDBMS and ML pages), then passes every lesson's
                       # certification test through the test screen and checks the sealed certificate
npm run test:monkey    # random/hostile actions across all workspaces and the test screen: no errors, nothing slow
```

After editing anything in `src/`, run `npm run build` and paste the new `apps-script/Index.html` into Apps Script.

### Adding a challenge

Add an entry in `src/js/challenges.js` (`plat`, `title`, `xp`, `task`, `hints`, `learn`, and either
`check(h)` or `type: 'quiz'` with `options`/`answer`). Then add its reference solution to
`tests/solutions.js`. The test suite fails if any challenge cannot be solved.

### Adding a certification-test question

Add it to the lesson's list in `src/banks/questions.js` with its answer (`a` for multiple choice/short answer, `ref` for a
formula, SQL or CSV answer). `npm run build` runs every reference answer through the engine and refuses to build if one
errors, if a multiple-choice answer is not among the options, or if answers would leak into the student app.

## Honest limits

- **Sealed is not unbreakable.** The page has to hold the signing key to seal files. Editing a progress file, editing the
  browser's saved progress, loading a friend's file, or bringing a file from another copy of SheetEX all fail. A student who
  opens developer tools, reads the JavaScript and re-implements the signing (or edits the page's memory while it runs)
  could still forge a certificate. That takes real skill and leaves no trace you can check for. On managed Chromebooks,
  Google Admin can turn developer tools off (Chrome policy *DeveloperToolsAvailability*), which closes most of that gap.
  Treat a certificate as strong evidence, not cryptographic proof.
- **Test answers are fingerprinted, not encrypted.** A multiple-choice answer can be found by hashing each option with the
  code in the page. Hands-on questions (half of every test) cannot be shortcut that way: the student has to produce a
  formula or query that actually works.
- **The test is open-browser.** SheetEX cannot stop a student from opening another tab. The test hides hints and the cheat
  sheet; supervision does the rest.
- **One sitting is not required:** progress stays in the browser on the same device/login, and the progress file moves it anywhere.

## Accuracy notes

SheetEX copies how each app behaves for the ~115 functions it supports. It is not the real software,
and the real apps have hundreds more functions. Behaviors it models: function availability by version,
argument differences, array evaluation (dynamic arrays vs Ctrl+Shift+Enter vs ARRAYFORMULA),
implicit intersection, spilling and `#SPILL!`, approximate-match VLOOKUP, blank-cell display,
parse-error handling, and SQLite typing rules. The SQL engine enforces PRIMARY KEY, UNIQUE, NOT NULL, CHECK,
DEFAULT, FOREIGN KEY and `STRICT` tables, and supports `BEGIN`/`COMMIT`/`ROLLBACK`, `CREATE TABLE … AS SELECT` and `PRAGMA table_info`. One deliberate
difference: foreign keys are enforced by default (like PostgreSQL and MySQL); real SQLite needs `PRAGMA foreign_keys = ON;`,
which SheetEX also accepts (and `= OFF` to show what happens without it). Edge cases can differ, so when something matters,
check it in the real app — which is the habit this project is trying to build.

SheetEX is not affiliated with Microsoft or Google. Product names identify the software being taught.
