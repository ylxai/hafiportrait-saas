import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    ignores: [".next/**", "node_modules/**", "src/generated/**"],
  },
  {
    rules: {
      "@next/next/no-assign-module-variable": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];
