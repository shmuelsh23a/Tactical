/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The pure engine (src/engine) is DOM-free; the app lives in src/app.
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
