// Teacher-only: discussion prompts and exit tickets per lesson (printed in dist/teacher-guide.html).
module.exports = {
  xl365: { minutes: 50, discuss: ['Why is a formula better than typing the answer, even if the answer is right today?', 'When would you use $A$2 instead of A2?'],
    exit: 'Write a formula that counts how many products cost more than $10.', exitAnswer: '=COUNTIF(Products!D2:D25,">10")' },
  xl2013: { minutes: 50, discuss: ['Your formula works at school but shows #NAME? at home. What are two possible reasons?', 'Why did people love SUMPRODUCT before dynamic arrays existed?'],
    exit: 'Rewrite =XLOOKUP("SKU-201", A2:A25, B2:B25) so it works in Excel 2013.', exitAnswer: '=INDEX(B2:B25, MATCH("SKU-201", A2:A25, 0))' },
  gs: { minutes: 50, discuss: ['Which is worse: a formula that errors, or one that silently gives the wrong answer? Why?', 'Name one thing Google Sheets can do that Excel cannot, and one the other way around.'],
    exit: 'In Google Sheets, sort Products!B2:D25 by price, lowest first.', exitAnswer: '=SORT(Products!B2:D25, 3, TRUE)' },
  csv: { minutes: 45, discuss: ['You email a coworker a CSV of your gradebook. What did you lose?', 'Why would anyone choose TSV over CSV?'],
    exit: 'Write the CSV line for:  Smith, Jo | 05401 | said "hi"', exitAnswer: '"Smith, Jo",05401,"said ""hi"""' },
  wr1: { minutes: 90, discuss: ['An AI model was trained on data where missing quantities were replaced with 0. What will it get wrong?', 'Is 03/04/2026 March 4 or April 3? How would you find out for a real dataset?', 'Why clean into a NEW column instead of overwriting the original?'],
    exit: 'A column of ZIP codes shows 2110 and 5401. Write the formula that fixes them.', exitAnswer: '=TEXT(A2, "00000")' },
  wr2: { minutes: 90, discuss: ['VLOOKUP says #N/A but you can SEE the value in the table. List three reasons this happens.', 'Why do joins (lookups) come AFTER cleaning, never before?'],
    exit: 'Count the items in "red|green|blue" with one formula that works in every app.', exitAnswer: '=LEN(A2)-LEN(SUBSTITUTE(A2,"|",""))+1' },
  sql: { minutes: 75, discuss: ['Which spreadsheet function is most like GROUP BY? Like JOIN? Like WHERE?', 'Why do real databases not have an Undo button — and what do companies do instead?'],
    exit: 'Write SQL for the number of sales per store.', exitAnswer: 'SELECT store_id, COUNT(*) FROM sales GROUP BY store_id;' },
  rdbms: { minutes: 60, discuss: ['Your school keeps student records. Why would it use a database instead of one giant spreadsheet?', 'Give an example from your own life where "all or nothing" matters (like the lunch-money transfer).', 'Constraints stop bad data before it is saved. How would that have helped in the Data Wrangling Lab?'],
    exit: 'Write the CREATE TABLE for clubs(club_id, name) where club_id is the primary key and name is required.', exitAnswer: 'CREATE TABLE clubs (club_id INTEGER PRIMARY KEY, name TEXT NOT NULL);' },
  compare: { minutes: 25, discuss: ['Before sharing a spreadsheet, what should you check?'],
    exit: 'Name a function that exists in Excel 365 but gives #NAME? in Excel 2013.', exitAnswer: 'XLOOKUP, FILTER, SORT, UNIQUE, IFS, TEXTJOIN, LET, MAXIFS…' }
};
