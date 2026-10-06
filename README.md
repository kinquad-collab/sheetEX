# SheetEX — Spreadsheet Explorer

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

Students start on a home page, pick a workspace, and earn **XP**, **levels** (Intern → Chief Data Officer)
and **badges**. Every workspace has a free-play sandbox plus a side panel with:

- **🏆 Challenges** — 49 auto-checked challenges with 2–3 progressive hints each. A hint costs 20% of that challenge's XP.
- **📘 Cheat sheet** — what is different on this platform, keyboard shortcuts, a searchable function list using *that* platform's argument names, and error codes.
- **🌐 Will it work elsewhere?** — runs the selected cell's formula in Excel 365, Excel 2013 and Google Sheets on the same data, shows each result, and writes the rewrite (for example XLOOKUP → `IFERROR(INDEX(…, MATCH(…, 0)), …)`, or MAXIFS → `{=MAX(IF(…))}`). One click applies the fix.

Other details: students collect all 9 error types (`#NAME?`, `#VALUE!`, `#REF!`, `#DIV/0!`, `#N/A`, `#NUM!`, `#SPILL!`, `#CALC!`, `#ERROR!`) for XP. There is also a **Compare** page with a formula playground, a function-availability matrix, and a spreadsheet → SQL dictionary.

## Deploy on Google Apps Script and embed in Canvas

`apps-script/` holds everything Apps Script needs. The whole app is **one self-contained file**
(`apps-script/Index.html`, ~410 KB) with no outside requests, so school web filters cannot break it.

1. Go to <https://script.google.com> → **New project**. Name it `SheetEX`.
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
  js/ui-*.js          home page, XP/badges, spreadsheet grid, CSV editor, SQL console, Compare page
build.js              inlines everything into dist/index.html and apps-script/Index.html
tests/                node:test suites + a Playwright browser smoke test
```

```bash
npm run build          # writes dist/index.html and apps-script/Index.html
npm test               # engine behaviour + "every challenge is solvable" tests
npm run test:browser   # optional: Playwright smoke test (normal page + locked-down iframe)
```

After editing anything in `src/`, run `npm run build` and paste the new `apps-script/Index.html` into Apps Script.

### Adding a challenge

Add an entry in `src/js/challenges.js` (`plat`, `title`, `xp`, `task`, `hints`, `learn`, and either
`check(h)` or `type: 'quiz'` with `options`/`answer`). Then add its reference solution to
`tests/challenges.test.js`. The test suite fails if any challenge cannot be solved.

## Accuracy notes

SheetEX copies how each app behaves for the ~115 functions it supports. It is not the real software,
and the real apps have hundreds more functions. Behaviors it models: function availability by version,
argument differences, array evaluation (dynamic arrays vs Ctrl+Shift+Enter vs ARRAYFORMULA),
implicit intersection, spilling and `#SPILL!`, approximate-match VLOOKUP, blank-cell display,
parse-error handling, and SQLite typing rules. Edge cases can differ, so when something matters,
check it in the real app — which is the habit this project is trying to build.

SheetEX is not affiliated with Microsoft or Google. Product names identify the software being taught.
