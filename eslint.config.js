import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "website/host-dashboard/app.js",
      "website/host-dashboard/game-data.js",
      "website/host-dashboard/supabase-config.js",
      "website/host-dashboard/ui-refresh.js",
      "website/host-dashboard/webgl-hero.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["website/host-dashboard/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          "allowConstantExport": true
        }
      ],
      "@typescript-eslint/no-explicit-any": "off"
    },
  },
  {
    files: ["scripts/**/*.mjs", "vite.config.ts", "playwright.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
