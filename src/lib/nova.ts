// Nova, the student study buddy: system prompt, safety screen and the offline
// template replies. Pure functions so they can be unit-tested.

export const NOVA_DAILY_LIMIT = 40;
export const NOVA_MAX_CHARS = 500;
export const NOVA_GREETING = "Hi! I'm Nova, your study buddy. I give hints first so you can figure things out. What are you working on?";

/** Model names stored on AiMessage when no model wrote the reply. */
export const TEMPLATE_MODEL = "template";
export const SAFETY_MODEL = "safety";

function gradeName(g: number | null | undefined) {
  if (g == null) return "a school student";
  if (g <= -1) return "a KG1 child (about 4 years old)";
  if (g === 0) return "a KG2 child (about 5 years old)";
  return `a Grade ${g} student (about ${g + 5} years old)`;
}

export function novaSystemPrompt(opts: { gradeLevel: number | null | undefined; firstName: string; subjects: string[] }) {
  const young = (opts.gradeLevel ?? 5) <= 4;
  return [
    `You are Nova, a kind and patient study buddy for ${opts.firstName}, ${gradeName(opts.gradeLevel)} at a school in the UAE.`,
    opts.subjects.length ? `Their subjects this year: ${opts.subjects.join(", ")}.` : "",
    "How you help:",
    "- Be Socratic. Give a small hint or ask a guiding question first. Never just hand over the answer to homework or an assignment question. If the student is still stuck after trying, give the next hint, and only explain a worked example of a similar (not the same) problem.",
    "- When the student shares an answer, help them check it themselves (\"What did you multiply by?\") instead of only saying right or wrong.",
    `- Write for their age: ${young ? "very short sentences, simple words, one idea at a time" : "clear, friendly language, short paragraphs"}. Keep replies under 120 words. Plain text only, no markdown headings or tables.`,
    "- Stay on school learning topics (subjects, study skills, reading, revision, how to plan homework). If asked about something else, kindly steer back to learning.",
    "- If the student mentions anything personal, worrying or unsafe (feeling very sad, being hurt, being bullied, someone making them uncomfortable), be warm and brief, and encourage them to talk to their teacher, school counsellor or another trusted adult straight away. Do not try to counsel them yourself.",
    "- Never ask for or repeat personal details such as phone numbers, addresses, passwords or social media accounts.",
    "- Be encouraging about effort and strategies, never about being clever. Never compare the student with others.",
    "- If you are not sure about a fact, say so and suggest checking with their teacher.",
  ].filter(Boolean).join("\n");
}

// ---------------- Safety screen ----------------

export type SafetyCategory = "self_harm" | "abuse" | "bullying" | "contact_details";
export type Screen = { ok: true } | { ok: false; category: SafetyCategory; reply: string };

const RULES: { category: SafetyCategory; patterns: RegExp[] }[] = [
  {
    category: "self_harm",
    patterns: [
      /\b(kill|hurt|harm|cut)(ing)?\s+(my\s?self|myself)\b/i,
      /\bsuicid/i, /\bself[-\s]?harm/i,
      /\b(want|wanna|going)\s+to\s+die\b/i, /\bend\s+my\s+life\b/i,
      /\b(don'?t|do not)\s+want\s+to\s+(be alive|live|exist)\b/i,
      /\bno\s+reason\s+to\s+live\b/i, /\bbetter\s+off\s+dead\b/i,
    ],
  },
  {
    category: "abuse",
    patterns: [
      /\b(hits?|hitting|beats?|beating|kicks?|kicking|hurts?|hurting|touch(es|ing)?)\s+me\b/i,
      /\b(abuse[ds]?|abusing)\b/i,
      /\bscared\s+(to\s+go\s+)?(of\s+going\s+)?home\b/i, /\bafraid\s+(to\s+go\s+)?(of\s+going\s+)?home\b/i,
      /\btouched\s+me\b/i, /\bkeep\s+(it\s+)?(a\s+)?secret\s+from\s+(my\s+)?(mum|mom|dad|parents|teacher)/i,
    ],
  },
  {
    category: "bullying",
    patterns: [
      /\bbull(y|ies|ied|ying)\b/i,
      /\b(everyone|they|kids|people)\s+(keep\s+)?(laugh(s|ing)?\s+at|mak(e|es|ing)\s+fun\s+of|pick(s|ing)?\s+on)\s+me\b/i,
      /\bnobody\s+(likes|wants\s+to\s+play\s+with)\s+me\b/i,
      /\b(threaten(ed|s|ing)?)\s+(me|to)\b/i,
    ],
  },
  {
    category: "contact_details",
    patterns: [
      /(?:\+|\b0)\d[\d\s-]{6,}\d/, // phone numbers (+971…, 05…)
      /[\w.+-]+@[\w-]+\.[\w.]+/, // email addresses
      /\bmy\s+(address|phone|number|snap(chat)?|insta(gram)?|tiktok|whatsapp|password)\s+is\b/i,
      /\b(i\s+live\s+(at|on)\s+\d+)/i,
    ],
  },
];

const REPLIES: Record<SafetyCategory, string> = {
  self_harm: "Thank you for telling me. What you're feeling really matters, and you deserve help from a person who cares about you. Please talk to your teacher, the school counsellor or a trusted adult today, right now if you can. If you are in danger, tell an adult near you straight away. I'm only a study buddy, so I can't help with this, but they can.",
  abuse: "Thank you for telling me. Nobody should hurt you or make you feel unsafe, and it is not your fault. Please tell a trusted adult as soon as you can, like your teacher, the school counsellor or the school nurse. They know how to help and keep you safe.",
  bullying: "I'm sorry that's happening. Being treated unkindly is never okay, and it's not your fault. Please tell your teacher or another trusted adult at school. They can help make it stop. You don't have to deal with it on your own.",
  contact_details: "Let's keep personal details private. Please don't share phone numbers, email or home addresses, passwords or social media names here, or with anyone online. Want to get back to your learning? Tell me what you're working on.",
};

/**
 * Checks a student's message before it goes to the model. A hit is not sent;
 * the student gets a caring fixed reply and the turn is flagged for review.
 */
export function screenMessage(text: string): Screen {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return { ok: false, category: rule.category, reply: REPLIES[rule.category] };
  }
  return { ok: true };
}

export const SAFETY_LABEL: Record<SafetyCategory, string> = {
  self_harm: "possible self-harm",
  abuse: "possible abuse or harm",
  bullying: "possible bullying",
  contact_details: "personal contact details",
};

// ---------------- Offline template replies ----------------

const TEMPLATES: { words: RegExp; reply: string }[] = [
  { words: /\b(\d+\s*\/\s*\d+)\s*=\s*(\d+\s*\/\s*\d+)/, reply: "Let's check it together. Look at the bottom numbers: what did you multiply (or divide) by to get from one to the other? Now, did you do the same to the top number? Try it, then tell me what you get." },
  { words: /fraction|numerator|denominator|half|quarter/i, reply: "Hint 1: picture a strip cut into 2 equal parts with 1 part shaded. If you cut each part in half again, how many parts are there now, and how many are shaded? Want hint 2, or want to try first?" },
  { words: /water\s*cycle|evaporat|condens|precipitat/i, reply: "Think of a puddle on a sunny day. Where does the water go? That's step 1, evaporation. What do you think happens when that water vapour rises up high where it's cold?" },
  { words: /multipl|times\s*table|\btimes\b|×/i, reply: "Try breaking it into smaller steps. For 7 × 8 you could do 7 × 4 first, then double it. Which part do you already know?" },
  { words: /divi(de|sion)|share\s+equally|÷/i, reply: "Division is sharing into equal groups. Try drawing the groups. How many go in each group? You can check by multiplying back." },
  { words: /\b(add|plus|sum|subtract|minus|take\s+away)\b/i, reply: "Line the numbers up by place value: ones under ones, tens under tens. Which column will you start with, and do you need to carry or exchange?" },
  { words: /percent|%/i, reply: "Percent means 'out of 100'. Hint: 10% is the whole divided by 10. Can you find 10% first, then build up to the percent you need?" },
  { words: /area|perimeter/i, reply: "Perimeter is the distance around the outside; area is the space inside. Which one is your question asking for? Try sketching the shape and labelling the sides." },
  { words: /spell|spelling/i, reply: "Try saying the word slowly and splitting it into sounds or syllables. Which part are you unsure of? Writing it a few different ways can help you spot the one that looks right." },
  { words: /read|story|chapter|character|book/i, reply: "Good readers look for clues. What does the character say or do that shows how they feel? Find one sentence as evidence, then tell me what you think it shows." },
  { words: /writ(e|ing)|essay|paragraph|sentence/i, reply: "Start with a plan: what is your main idea in one sentence? Then list two or three details that support it. What's your main idea?" },
  { words: /plant|photosynth|seed|leaf|leaves/i, reply: "Think about what a plant needs to grow. What do you think the leaves do with sunlight? Try listing three things a plant needs first." },
  { words: /revis|test|exam|quiz|study/i, reply: "A good plan: pick one topic, try three practice questions without notes, then check which ones were tricky. Which topic is coming up first?" },
];

/** Hint-style template reply used when the AI service is not connected. */
export function offlineReply(text: string): string {
  const hit = TEMPLATES.find((t) => t.words.test(text));
  return hit?.reply ?? "Good question! Let's break it into small steps. What part do you already know? Tell me what you've tried so far and I'll give you a hint for the next step.";
}

/** Fixed reply when the model declined to answer. */
export const REFUSAL_REPLY = "I can't help with that one. Let's get back to your learning. What subject are you working on? If something is worrying you, please talk to your teacher or a trusted adult.";
