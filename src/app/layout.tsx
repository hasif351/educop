import type { Metadata } from "next";
import { Lexend, Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

const display = Lexend({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], variable: "--font-body", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "Educop", template: "%s · Educop" },
  description: "AI-powered KG–12 learning platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
