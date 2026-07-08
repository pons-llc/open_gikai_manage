import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["design-system-mcp/**", "node_modules/**"],
  },
});
