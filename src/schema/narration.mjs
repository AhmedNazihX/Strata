/**
 * The caption's notes should add to the step's lede, not restate it.
 *
 * The cheapest note to write is the lede again in fewer words, which teaches
 * the reader nothing the left side of the caption has not already said.
 */

import { Issue } from './kit.mjs';

/* A note whose words are mostly found already in the lede is a restatement.
   Short words carry no meaning for this comparison. */
const REPEAT_SHARE = 0.6;
const MIN_WORD = 4;

/** Warnings: notes that only repeat their step's lede. */
export function checkNoteContent(doc) {
  const warnings = [];
  (doc.steps || []).forEach((step, s) => {
    (step.notes || []).forEach((note, n) => {
      if (repeats(note.v, step.lede || '')) {
        warnings.push(new Issue(
          `steps[${s}].notes[${n}]`,
          `"${note.k}" repeats the lede`,
          'say what the lede does not: a number, a reason, a consequence, a failure mode',
        ));
      }
    });
  });
  return warnings;
}

function words(text) {
  return new Set(String(text).toLowerCase().match(/[a-z0-9_]+/g)?.filter((w) => w.length >= MIN_WORD) || []);
}

/** Are most of `text`'s meaningful words already in `other`? */
function repeats(text, other) {
  const mine = words(text);
  if (!mine.size) return false;
  const theirs = words(other);
  let shared = 0;
  for (const word of mine) if (theirs.has(word)) shared += 1;
  return shared / mine.size >= REPEAT_SHARE;
}
