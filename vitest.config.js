import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.tests.ts"],
    passWithNoTests: false,
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["**/node_modules/**", "dist", "**/types/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 75,
        branches: 60,
      },
    },
  },
});
