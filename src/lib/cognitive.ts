// Reasoning-skills practice: items are generated in code from a seed, so a
// session can be replayed on the server to score it. Pure functions only (used
// by the client player, the server actions, the seed and unit tests).
// This is practice, not a test: nothing here produces an IQ, percentile or rank.

export const DOMAINS = ["patterns", "memory", "verbal", "spatial", "speed"] as const;
export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_INFO: Record<Domain, { label: string; noun: string; blurb: string }> = {
  patterns: { label: "Patterns", noun: "patterns", blurb: "Spot the rule and find what comes next." },
  memory: { label: "Memory", noun: "memory puzzles", blurb: "Hold a short list in your head, then answer a question about it." },
  verbal: { label: "Verbal reasoning", noun: "word puzzles", blurb: "Find how words are linked, and which one doesn't belong." },
  spatial: { label: "Spatial", noun: "shape puzzles", blurb: "Picture how an arrow turns and where it points next." },
  speed: { label: "Processing speed", noun: "quick puzzles", blurb: "Short, simple puzzles. Go at a steady pace that feels comfortable." },
};

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export function isDomain(v: string): v is Domain {
  return (DOMAINS as readonly string[]).includes(v);
}

export type Band = "early" | "primary" | "middle" | "senior";
/** Age band from User.gradeLevel (0 = KG2, -1 = KG1). Unknown grades get the primary band. */
export function bandFor(gradeLevel: number | null | undefined): Band {
  const g = gradeLevel ?? 5;
  return g <= 2 ? "early" : g <= 5 ? "primary" : g <= 8 ? "middle" : "senior";
}
export const itemsPerSet = (band: Band) => (band === "early" ? 6 : 8);
const BAND_BASE: Record<Band, number> = { early: 0, primary: 1, middle: 3, senior: 5 };

export type Item = {
  domain: Domain;
  level: number;
  prompt: string;
  /** Tokens shown with the prompt, e.g. a sequence with "?" at the end. */
  figure?: string[];
  /** Shown first and then hidden (memory items). */
  memo?: string[];
  options: string[];
  /** Screen-reader names for options that are symbols (arrows). */
  optionLabels?: string[];
  answerIndex: number;
};

// ---------------- Seeded randomness ----------------

function hash(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32: small, fast and good enough for puzzles. */
export function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const int = (r: R, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const pick = <T,>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
function shuffle<T>(r: R, xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Four options: the answer plus three distinct distractors, in a seeded order. */
function withOptions(r: R, answer: string, distractors: string[]) {
  const ds = [...new Set(distractors.filter((d) => d !== answer))].slice(0, 3);
  const options = shuffle(r, [answer, ...ds]);
  return { options, answerIndex: options.indexOf(answer) };
}

function numberOptions(r: R, answer: number, near: number[]) {
  const pool = [...near, answer + 1, answer - 1, answer + 2, answer + 10, answer - 2].filter((n) => n >= 0 && n !== answer);
  return withOptions(r, String(answer), shuffle(r, [...new Set(pool)]).map(String));
}

// ---------------- Generators ----------------
// d is the difficulty: the student's level shifted by their age band (1..10).

function patterns(r: R, d: number): Omit<Item, "domain" | "level"> {
  if (d <= 2) {
    const shapes = shuffle(r, ["🔴", "🔵", "🟢", "🟡", "🟣"]);
    const unit = shapes.slice(0, d === 1 ? 2 : 3);
    const seq = Array.from({ length: unit.length * 2 + 1 }, (_, i) => unit[i % unit.length]);
    const answer = unit[seq.length % unit.length];
    return { prompt: "What comes next?", figure: [...seq, "?"], ...withOptions(r, answer, shapes) };
  }
  let seq: number[];
  if (d <= 4) {
    const step = d === 3 ? int(r, 2, 5) : int(r, 3, 9);
    // Level 4 sometimes counts down instead of up.
    const down = d === 4 && r() < 0.5;
    const start = down ? int(r, 4 * step + 1, 4 * step + 30) : int(r, 1, 20);
    seq = [0, 1, 2, 3, 4].map((i) => start + (down ? -i : i) * step);
  } else if (d <= 6) {
    if (r() < 0.5) { const k = pick(r, [2, 3]); const start = int(r, 1, d === 5 ? 4 : 6); seq = [0, 1, 2, 3, 4].map((i) => start * k ** i); }
    else { const a = int(r, 1, 5), b = int(r, 6, 10), start = int(r, 1, 15); seq = [start]; for (let i = 1; i < 5; i++) seq.push(seq[i - 1] + (i % 2 ? a : b)); }
  } else if (d <= 8) {
    if (r() < 0.5) { const c = int(r, 0, 5), o = int(r, 1, 3); seq = [0, 1, 2, 3, 4].map((i) => (i + o) ** 2 + c); }
    else { const start = int(r, 1, 10), first = int(r, 1, 3); seq = [start]; for (let i = 1; i < 5; i++) seq.push(seq[i - 1] + first + i - 1); }
  } else {
    if (r() < 0.5) { seq = [int(r, 1, 4), int(r, 2, 6)]; while (seq.length < 5) seq.push(seq[seq.length - 1] + seq[seq.length - 2]); }
    else { seq = [int(r, 1, 4)]; while (seq.length < 5) seq.push(seq[seq.length - 1] * 2 + 1); }
  }
  const shown = seq.slice(0, 4), answer = seq[4];
  const diff = seq[4] - seq[3];
  return { prompt: "What number comes next?", figure: [...shown.map(String), "?"], ...numberOptions(r, answer, [seq[3] + diff + 1, seq[3] + diff - 1, seq[3] + (seq[3] - seq[2]), answer + diff]) };
}

const MEMO_LENGTH: Record<Band, number[]> = { early: [3, 3, 4, 4, 5], primary: [4, 4, 5, 6, 7], middle: [5, 6, 6, 7, 8], senior: [5, 6, 7, 8, 9] };
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];

function memory(r: R, level: number, band: Band): Omit<Item, "domain" | "level"> {
  const n = MEMO_LENGTH[band][level - 1];
  const digits = shuffle(r, ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const list = digits.slice(0, n), others = digits.slice(n);
  if (level <= 2) {
    return { memo: list, prompt: "Which number was NOT in the list?", ...withOptions(r, others[0], shuffle(r, list)) };
  }
  if (level <= 4) {
    const k = int(r, 0, n - 1);
    return { memo: list, prompt: `Which number was ${ORDINAL[k]} in the list?`, ...withOptions(r, list[k], shuffle(r, list)) };
  }
  const k = int(r, 0, n - 2);
  return { memo: list, prompt: `Which number came straight after ${list[k]}?`, ...withOptions(r, list[k + 1], shuffle(r, list.filter((_, i) => i !== k))) };
}

// [a, b, c, answer, distractors]: "a is to b as c is to …"
const ANALOGIES: [string, string, string, string, string[]][][] = [
  [
    ["Bird", "nest", "bee", "hive", ["flower", "honey", "garden"]],
    ["Cat", "kitten", "dog", "puppy", ["bone", "cow", "lamb"]],
    ["Hot", "cold", "up", "down", ["warm", "high", "over"]],
    ["Hand", "glove", "foot", "sock", ["toe", "leg", "hat"]],
    ["Day", "sun", "night", "moon", ["dark", "sleep", "sky"]],
    ["Fish", "swim", "bird", "fly", ["feather", "sing", "egg"]],
  ],
  [
    ["Author", "book", "painter", "painting", ["brush", "colour", "museum"]],
    ["Pen", "write", "knife", "cut", ["fork", "sharp", "kitchen"]],
    ["Doctor", "hospital", "teacher", "school", ["student", "lesson", "book"]],
    ["Seed", "tree", "egg", "chicken", ["nest", "shell", "farm"]],
    ["Thermometer", "temperature", "ruler", "length", ["line", "school", "weight"]],
    ["Ice", "water", "water", "steam", ["cold", "rain", "cloud"]],
  ],
  [
    ["Brave", "cowardly", "generous", "selfish", ["kind", "wealthy", "giving"]],
    ["Composer", "symphony", "architect", "building", ["bricks", "drawing", "city"]],
    ["Drought", "rain", "famine", "food", ["hunger", "farm", "desert"]],
    ["Orbit", "planet", "current", "river", ["water", "electric", "sea"]],
    ["Minute", "hour", "metre", "kilometre", ["centimetre", "distance", "mile"]],
    ["Chapter", "novel", "verse", "poem", ["rhyme", "poet", "word"]],
  ],
];
const CATEGORIES: string[][][] = [
  [["apple", "banana", "grape", "mango", "pear"], ["dog", "horse", "lion", "rabbit", "camel"], ["red", "blue", "green", "yellow", "purple"], ["car", "bus", "bike", "train", "boat"]],
  [["violin", "drum", "flute", "piano", "guitar"], ["chair", "table", "sofa", "bed", "shelf"], ["rain", "snow", "fog", "hail", "wind"], ["circle", "square", "triangle", "hexagon", "oval"]],
  [["Mercury", "Venus", "Mars", "Jupiter", "Saturn"], ["iron", "copper", "gold", "silver", "zinc"], ["heart", "lungs", "liver", "kidney", "brain"], ["whisper", "mutter", "murmur", "mumble", "shout"]],
];

function verbal(r: R, d: number): Omit<Item, "domain" | "level"> {
  const tier = d <= 3 ? 0 : d <= 6 ? 1 : 2;
  if (r() < 0.5) {
    const [a, b, c, answer, ds] = pick(r, ANALOGIES[tier]);
    return { prompt: `${a} is to ${b} as ${c[0].toUpperCase()}${c.slice(1)} is to…`, ...withOptions(r, answer, ds) };
  }
  const cats = shuffle(r, CATEGORIES[tier]);
  const same = shuffle(r, cats[0]).slice(0, 3);
  const odd = pick(r, cats[1]);
  const options = shuffle(r, [...same, odd]);
  return { prompt: "Which word doesn't belong with the others?", options, answerIndex: options.indexOf(odd) };
}

export const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const ARROW_NAMES = ["up", "up and right", "right", "down and right", "down", "down and left", "left", "up and left"];
const arrowLabel = (a: string) => `Arrow pointing ${ARROW_NAMES[ARROWS.indexOf(a)]}`;

function spatial(r: R, d: number): Omit<Item, "domain" | "level"> {
  const start = d <= 3 ? pick(r, [0, 2, 4, 6]) : int(r, 0, 7);
  const steps = d <= 3 ? [2, 2] : d <= 5 ? (r() < 0.5 ? [2, 2] : [6, 6]) : d <= 7 ? (() => { const s = pick(r, [1, 3, 5, 7]); return [s, s]; })() : [pick(r, [1, 2, 3]), pick(r, [5, 6, 7])];
  const seq = [start];
  const shown = d <= 7 ? 3 : 4;
  for (let i = 1; i <= shown; i++) seq.push((seq[i - 1] + steps[(i - 1) % 2]) % 8);
  const answer = ARROWS[seq[shown]];
  const distractors = shuffle(r, [ARROWS[(seq[shown] + 4) % 8], ARROWS[seq[shown - 1]], ARROWS[(seq[shown] + 2) % 8], ARROWS[(seq[shown] + 6) % 8], ARROWS[(seq[shown] + 1) % 8]]);
  const o = withOptions(r, answer, distractors);
  return {
    prompt: steps[0] === steps[1] ? "The arrow turns the same way each step. Which way does it point next?" : "The arrow repeats a two-turn pattern. Which way does it point next?",
    figure: [...seq.slice(0, shown).map((i) => ARROWS[i]), "?"],
    ...o, optionLabels: o.options.map(arrowLabel),
  };
}

function speed(r: R, d: number): Omit<Item, "domain" | "level"> {
  if (d <= 3 || r() < 0.3) {
    const max = d <= 2 ? 20 : d <= 5 ? 100 : 1000;
    const nums = new Set<number>();
    while (nums.size < 4) nums.add(int(r, 1, max));
    const list = [...nums];
    const biggest = Math.max(...list);
    const options = shuffle(r, list.map(String));
    return { prompt: "Tap the biggest number.", options, answerIndex: options.indexOf(String(biggest)) };
  }
  let a: number, b: number, answer: number, sym: string;
  if (d <= 5) { a = int(r, 2, 12); b = int(r, 1, 9); if (r() < 0.5) { sym = "+"; answer = a + b; } else { sym = "−"; a += b; answer = a - b; } }
  else if (d <= 7) { a = int(r, 2, 9); b = int(r, 2, 9); sym = "×"; answer = a * b; }
  else { b = int(r, 3, 12); answer = int(r, 3, 12); a = b * answer; sym = "÷"; }
  return { prompt: `${a} ${sym} ${b} = ?`, ...numberOptions(r, answer, [answer + 1, answer - 1, answer + b, answer - 2]) };
}

/** One item, fully determined by (domain, grade, seed, index, level). */
export function generateItem(domain: Domain, gradeLevel: number | null | undefined, seed: string, index: number, level: number): Item {
  const lv = clampLevel(level);
  const band = bandFor(gradeLevel);
  const d = Math.min(10, BAND_BASE[band] + lv);
  const r = rng(`${seed}:${domain}:${index}:${lv}`);
  const body = domain === "patterns" ? patterns(r, d)
    : domain === "memory" ? memory(r, lv, band)
    : domain === "verbal" ? verbal(r, d)
    : domain === "spatial" ? spatial(r, d)
    : speed(r, d);
  return { domain, level: lv, ...body };
}

export const clampLevel = (n: number) => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(n)));

// ---------------- Adaptive level ----------------

/** run counts consecutive right (+) or wrong (−) answers since the level last changed. */
export type AdaptState = { level: number; run: number };

/** Two right in a row: one level harder. Two wrong in a row: one level easier. */
export function adapt(state: AdaptState, correct: boolean): AdaptState {
  const run = correct ? Math.max(0, state.run) + 1 : Math.min(0, state.run) - 1;
  if (run >= 2 && state.level < MAX_LEVEL) return { level: state.level + 1, run: 0 };
  if (run <= -2 && state.level > MIN_LEVEL) return { level: state.level - 1, run: 0 };
  return { level: state.level, run };
}

/** Start where the last set ended, so practice stays just-right. */
export function startLevel(last: { level: number } | null | undefined) {
  return clampLevel(last?.level ?? 1);
}

// ---------------- Scoring ----------------

export type Answer = { choice: number | null; ms: number };
export type PlayedItem = Item & { choice: number | null; ms: number; correct: boolean };

/**
 * Rebuilds a session from its seed and the student's choices, re-deriving every
 * item and level. The server uses this so a browser can't claim a score.
 */
export function replaySession(domain: Domain, gradeLevel: number | null | undefined, seed: string, start: number, answers: Answer[]) {
  const n = Math.min(answers.length, itemsPerSet(bandFor(gradeLevel)));
  let state: AdaptState = { level: clampLevel(start), run: 0 };
  const items: PlayedItem[] = [];
  for (let i = 0; i < n; i++) {
    const item = generateItem(domain, gradeLevel, seed, i, state.level);
    const { choice, ms } = answers[i];
    const correct = choice != null && choice === item.answerIndex;
    items.push({ ...item, choice, ms: Math.max(0, Math.min(600_000, Math.round(ms))), correct });
    state = adapt(state, correct);
  }
  return { items, ...scoreItems(items), endLevel: state.level };
}

export function scoreItems(items: { correct: boolean; ms: number; choice: number | null }[]) {
  const answered = items.filter((i) => i.choice != null);
  const correct = items.filter((i) => i.correct).length;
  const avgMs = answered.length ? Math.round(answered.reduce((a, i) => a + i.ms, 0) / answered.length) : null;
  return { correct, total: items.length, avgMs };
}

// ---------------- Growth, in friendly words ----------------

export type SessionSummary = { correct: number; total: number; avgMs: number | null; level: number };

/**
 * Compares the student's recent sets with their own earlier ones (never with
 * other students) and says what is growing. Sessions are oldest first.
 */
export function growthMessage(domain: Domain, sessions: SessionSummary[]): { tone: "new" | "up" | "steady"; text: string } {
  const noun = DOMAIN_INFO[domain].noun;
  const done = sessions.filter((s) => s.total > 0);
  if (done.length === 0) return { tone: "new", text: `Not tried yet. Give ${noun} a go!` };
  if (done.length === 1) return { tone: "new", text: `Great start on ${noun}. Do another set to see how you grow.` };
  const half = Math.min(3, Math.floor(done.length / 2));
  const before = done.slice(-half * 2, -half), recent = done.slice(-half);
  const acc = (xs: SessionSummary[]) => xs.reduce((a, s) => a + s.correct, 0) / Math.max(1, xs.reduce((a, s) => a + s.total, 0));
  const lvl = (xs: SessionSummary[]) => xs.reduce((a, s) => a + s.level, 0) / xs.length;
  const ms = (xs: SessionSummary[]) => { const t = xs.filter((s) => s.avgMs != null); return t.length ? t.reduce((a, s) => a + s.avgMs!, 0) / t.length : null; };
  const [msBefore, msRecent] = [ms(before), ms(recent)];
  const quicker = msBefore != null && msRecent != null && msRecent <= msBefore * 0.85 && acc(recent) >= acc(before) - 0.1;
  if (domain === "speed" && quicker) return { tone: "up", text: `You're getting quicker at ${noun}.` };
  if (lvl(recent) > lvl(before) + 0.4) return { tone: "up", text: `You're taking on harder ${noun} than before.` };
  if (acc(recent) >= acc(before) + 0.1) return { tone: "up", text: `You're solving more ${noun} than you used to.` };
  if (quicker) return { tone: "up", text: `You're getting quicker at ${noun}.` };
  return { tone: "steady", text: `You're keeping steady with ${noun}. Regular practice keeps it strong.` };
}
