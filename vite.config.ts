import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// See src/nodeStub.ts: hospital-resident-matching reaches for node:fs to save
// and load instance files, which the browser build has to do without.
const nodeStub = fileURLToPath(new URL("./src/nodeStub.ts", import.meta.url));

// Which code built this page. A result file that carries the commit can be tied
// back to the source that produced it, which is what we need when a bug turns up
// and we have to decide which results to throw away. See src/version.ts.
//
// --always falls back to the short hash when no tag is reachable, so this works
// before any tag exists and on a shallow checkout.
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // Building outside a checkout, or without git installed
    return "";
  }
}

const commit = git("describe", "--tags", "--always", "--dirty") || "不明";
// Formatted once, here, so the screen and the summary print the same string.
// sv-SE gives "2026-09-25 14:03:12"; the builder's clock is often UTC, so name
// the zone rather than leaving the reader to guess it.
const builtAt = `${new Date()
  .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
  .slice(0, 16)} JST`;

export default defineConfig({
  // Relative, so that dist/ can be served from any path (GitHub Pages included)
  base: "./",
  define: {
    __COMMIT__: JSON.stringify(commit),
    __BUILT_AT__: JSON.stringify(builtAt),
  },
  resolve: {
    alias: {
      "node:fs": nodeStub,
      "node:path": nodeStub,
    },
  },
});
