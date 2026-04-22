import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["dist/**", "test/**", "scripts/**", "infra/**", "**/*.config.ts"],
    },
  },
});
