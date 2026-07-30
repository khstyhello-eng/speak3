export const PASS_THRESHOLD = 0.8;

const CONTRACTIONS = [
  ["i'm", 'i am'], ["it's", 'it is'], ["that's", 'that is'], ["what's", 'what is'],
  ["he's", 'he is'], ["she's", 'she is'], ["there's", 'there is'], ["let's", 'let us'],
  ["you're", 'you are'], ["we're", 'we are'], ["they're", 'they are'],
  ["don't", 'do not'], ["doesn't", 'does not'], ["didn't", 'did not'],
  ["can't", 'cannot'], ["won't", 'will not'], ["isn't", 'is not'], ["aren't", 'are not'],
  ["wasn't", 'was not'], ["couldn't", 'could not'], ["wouldn't", 'would not'], ["shouldn't", 'should not'],
  ["i've", 'i have'], ["you've", 'you have'], ["we've", 'we have'], ["they've", 'they have'],
  ["i'll", 'i will'], ["you'll", 'you will'], ["we'll", 'we will'], ["he'll", 'he will'],
  ["i'd", 'i would'], ["you'd", 'you would'],
  ['gonna', 'going to'], ['wanna', 'want to'], ['gotta', 'got to'],
];

const SKIP = new Set(['a', 'an', 'the', 'uh', 'um', 'oh', 'ah', 'hey', 'well']);

export function normalize(text) {
  let t = text.toLowerCase();
  for (const [from, to] of CONTRACTIONS) t = t.replaceAll(from, to);
  t = t.replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

export function tokens(text) {
  const all = normalize(text).split(' ').filter(Boolean);
  const kept = all.filter((w) => !SKIP.has(w));
  return kept.length ? kept : all;
}

export function matchScore(expected, actual) {
  const exp = tokens(expected);
  if (!exp.length) return 0;
  const bag = new Map();
  for (const w of tokens(actual)) bag.set(w, (bag.get(w) || 0) + 1);
  let matched = 0;
  for (const w of exp) {
    const n = bag.get(w) || 0;
    if (n > 0) { matched++; bag.set(w, n - 1); }
  }
  return matched / exp.length;
}

export function bestScore(expected, alternatives) {
  return Math.max(0, ...alternatives.map((a) => matchScore(expected, a)));
}
