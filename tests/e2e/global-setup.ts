import { execSync } from "node:child_process";

export default function globalSetup() {
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}
