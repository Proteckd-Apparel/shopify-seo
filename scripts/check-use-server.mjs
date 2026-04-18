// Guard rail for Next 16 "use server" files.
//
// In Next 16, a file that starts with "use server" can only export async
// functions (and types, erased at compile). Exporting a const, object
// literal, enum, or plain function breaks the Railway build with a cryptic
// error. This script scans src/ for "use server" files and fails the build
// if any non-async export slips in.
//
// Runs as part of `npm run build` (prebuild hook).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\//, "");
const SRC = ROOT.includes(":") ? ROOT : "/" + ROOT;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
      yield* walk(full);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      yield full;
    }
  }
}

const violations = [];

for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  const firstLine = src.split("\n", 1)[0]?.trim();
  const isUseServer =
    firstLine === '"use server";' ||
    firstLine === "'use server';" ||
    firstLine === '"use server"' ||
    firstLine === "'use server'";
  if (!isUseServer) continue;

  // Lines of concern: exports that are not `async function`, `async function*`,
  // or `type`/`interface`. Re-exports (`export * from ...`) are also fine
  // when the source is another "use server" module, but we can't resolve
  // that here; flag only top-level exports of non-async values.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip comments
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    const m = line.match(
      /^\s*export\s+(const|let|var|function(?!\s*\*?\s*async)|class|enum|default(?!\s+async))/,
    );
    if (!m) continue;

    // allowed: `export async function`, `export default async`, `export type`, `export interface`, `export { ... }` re-exports
    if (/^\s*export\s+(async|type|interface)\b/.test(line)) continue;
    if (/^\s*export\s+default\s+async\b/.test(line)) continue;
    if (/^\s*export\s*\*/.test(line)) continue;
    if (/^\s*export\s*\{/.test(line)) continue;

    violations.push(
      `${relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`,
    );
  }
}

if (violations.length > 0) {
  console.error("\n❌ 'use server' files may only export async functions.\n");
  console.error(
    "Next 16 rejects const/class/enum/non-async-function exports from\n" +
      "'use server' files. Move these to a plain module and re-import.\n",
  );
  for (const v of violations) console.error("  " + v);
  console.error("");
  process.exit(1);
}

console.log("✓ use-server exports OK");
