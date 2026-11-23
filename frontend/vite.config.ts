import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Ishlab chiqishda /api so'rovlari backendga proxy qilinadi,
// shuning uchun bitta tunnel (Vite portiga) yetarli.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true, // cloudflared / ngrok domenlariga ruxsat
    proxy: { "/api": BACKEND_URL },
  },
});
