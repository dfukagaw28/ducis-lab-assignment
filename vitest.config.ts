import { defineConfig } from "vitest/config";

// vite.config.ts が node:fs と node:path をスタブに差し替えるのはブラウザ向けの
// 都合で、テストは Node で走るので本物が要る。vitest.config.ts があるとそちらが
// 使われ、vite.config.ts の alias は効かない。
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
