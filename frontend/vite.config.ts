import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production serves at https://rtusiime.github.io/grade-level-rewriter/.
// Dev stays at the root so http://localhost:5173/ works as expected.
// Override VITE_BASE_PATH if you deploy somewhere else (custom domain, etc.).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base:
    process.env.VITE_BASE_PATH ??
    (command === "build" ? "/grade-level-rewriter/" : "/"),
}));
