import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        brand: { DEFAULT: v("blue"), soft: v("blue-soft") },
        teal: { DEFAULT: v("teal"), soft: v("teal-soft") },
        good: { DEFAULT: v("good"), soft: v("good-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        bad: { DEFAULT: v("bad"), soft: v("bad-soft") },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "12px" },
    },
  },
  plugins: [],
} satisfies Config;
