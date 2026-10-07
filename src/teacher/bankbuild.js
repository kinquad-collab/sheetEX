// Turns the teacher-only bank into the student bank: answers become fingerprints. Every reference answer is run
// through the same engine students use; anything that errors or cannot be graded stops the build.
'use strict';
const SHIP = ['id', 'kind', 'topic', 'q', 'opts', 'plat', 'book', 'sheet', 'at', 'fill', 'show', 'ordered', 'probes', 'delim', 'must', 'same'];

module.exports = function buildBank(SX, bank) {
  const out = {}, problems = [], warnings = [], seen = {};
  const H = (q, norm) => SX.seal.answerHash(q.id, norm);
  Object.keys(bank).forEach((lesson) => {
    out[lesson] = bank[lesson].map((q) => {
      if (seen[q.id]) problems.push('duplicate id ' + q.id); seen[q.id] = true;
      const s = {}; SHIP.forEach((k) => { if (q[k] !== undefined) s[k] = q[k]; });
      if (q.kind === 'mc') {
        if (q.opts.indexOf(q.a) < 0) problems.push(q.id + ': answer is not one of the options');
        if (new Set(q.opts).size !== q.opts.length) problems.push(q.id + ': duplicate options');
        s.h = [H(q, q.a)];
      } else if (q.kind === 'text') {
        s.h = q.a.map((a) => H(q, SX.certtest.normText(a)));
      } else {
        const e = SX.certtest.evaluate(q, { text: q.ref, cse: !!q.cse });
        if (e.norm === null) { problems.push(q.id + ': reference answer fails: ' + JSON.stringify(e.preview)); s.h = []; return s; }
        if (q.kind === 'formula' || q.kind === 'sql') {
          const flat = JSON.stringify(JSON.parse(e.norm));
          if (/"#[A-Z\/0!?]+"/.test(flat)) problems.push(q.id + ': reference result contains an error value');
          const both = JSON.parse(e.norm);
          if (!q.fill && !q.same && JSON.stringify(both[0]) === JSON.stringify(both[1])) warnings.push(q.id + ': shuffled data gives the same answer (relies on the "must refer to data" rule)');
        }
        if (q.kind === 'csv' && e.norm !== JSON.stringify(q.fields)) problems.push(q.id + ': reference CSV does not parse to the expected fields: ' + e.norm);
        if (q.kind === 'formula' && q.cse) {
          const plain = SX.certtest.evaluate(q, { text: q.ref, cse: false });
          if (plain.norm === e.norm) warnings.push(q.id + ': gives the same answer without Ctrl+Shift+Enter');
        }
        s.h = [H(q, e.norm)];
      }
      if (!SX.certtest.isCorrect(s, { text: q.kind === 'mc' ? q.a : q.kind === 'text' ? q.a[0] : q.ref, cse: !!q.cse })) problems.push(q.id + ': shipped question does not accept its own answer');
      return s;
    });
  });
  return { bank: out, problems, warnings };
};
