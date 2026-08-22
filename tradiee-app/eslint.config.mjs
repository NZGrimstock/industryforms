import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The React Compiler rules (eslint-plugin-react-hooks v6) flag idiomatic code
  // — including server components (per-request `new Date()`), `window.location`
  // navigation, and effect-based subscriptions. Keep them visible as warnings
  // rather than build-breaking errors until a dedicated React Compiler migration.
  {
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      // Underscore-prefixed args/vars are the established convention here for
      // deliberately-unused params (e.g. route handlers keeping an unused
      // `_req`, stub functions keeping a documented future param).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
