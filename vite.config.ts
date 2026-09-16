import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/persora-agentic-support-lab/",
  server: { port: 4173 },
});
