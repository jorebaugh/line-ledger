// Feedback works like the Mint schedule page: a link that opens an email to the developer, pre-filled
// with boxes to tick. Nothing from the app goes with it, only the app version and which screen it came from.

export const FEEDBACK_SUBJECT = 'Line Ledger feedback';

export const FEEDBACK_TEMPLATE = [
  'Tick whatever applies (or ignore this and freestyle):',
  '',
  '[ ] It matched my check.',
  '[ ] A number was off. Which screen, and by how much:',
  '[ ] Something broke. Right before it broke, I:',
  '[ ] Most useful part:',
  '[ ] I wish it did:',
  "[ ] I'd pay $___ a month for it.",
  "[ ] I'd use it, but only if it's free.",
  '[ ] Just saying hi.',
  '',
  'Details (screenshots welcome, but cover your name and employee number):',
  '',
  '',
];

export function feedbackBody(version, where) {
  return [...FEEDBACK_TEMPLATE, `(Line Ledger ${version}${where ? `, from ${where}` : ''})`].join('\n');
}

// The address goes in as-is (some mail apps don't decode %40); subject and body are encoded.
export const feedbackLink = (to, version, where) =>
  `mailto:${to}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(feedbackBody(version, where))}`;
