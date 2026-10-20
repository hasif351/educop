// Shared by the recommendation actions and forms.
export const REC_KINDS = ["REVIEW", "PRACTICE", "CHALLENGE"] as const;
export const KIND_LABEL: Record<string, string> = { REVIEW: "Review", PRACTICE: "Practice", CHALLENGE: "Stretch" };
export const KIND_TONE: Record<string, "blue" | "teal" | "good"> = { REVIEW: "blue", PRACTICE: "teal", CHALLENGE: "good" };
export const NOTE_PREFIX = "Teacher note: ";
