import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel сервира от корена → base "/". (За GitHub Pages проект-сайт смени на "/<repo>/".)
export default defineConfig({
  plugins: [react()],
  base: "/",
});
