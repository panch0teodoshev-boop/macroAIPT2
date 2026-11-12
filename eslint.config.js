import react from "eslint-plugin-react";
import globals from "globals";
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["src/**/*.{js,jsx,mjs}", "cloudflare/**/*.js", "tests/**/*.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    plugins: { react },
    rules: { "no-undef": "error", "no-unused-vars": ["warn", { args: "none" }], "react/jsx-uses-vars": "error", "react/jsx-uses-react": "error", "no-dupe-keys": "error", "no-unreachable": "error" },
  },
];
