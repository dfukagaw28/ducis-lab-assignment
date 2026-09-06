import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// See src/nodeStub.ts: hospital-resident-matching reaches for node:fs to save
// and load instance files, which the browser build has to do without.
const nodeStub = fileURLToPath(new URL("./src/nodeStub.ts", import.meta.url));

export default defineConfig({
  // Relative, so that dist/ can be served from any path (GitHub Pages included)
  base: "./",
  resolve: {
    alias: {
      "node:fs": nodeStub,
      "node:path": nodeStub,
    },
  },
});
