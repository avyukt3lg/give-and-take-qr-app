import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/give-and-take-qr-app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "website/host-dashboard/src"),
    },
  },
  publicDir: false,
  build: {
    outDir: path.resolve(rootDir, "dist"),
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(rootDir, "website/host-dashboard/index.html"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [
      path.resolve(rootDir, "website/host-dashboard/src/test/setup.ts"),
    ],
    include: [
      "website/host-dashboard/src/test/**/*.test.{ts,tsx}",
    ],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
