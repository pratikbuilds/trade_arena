import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/pyth": {
        target: "https://pyth.dourolabs.app/v1/fixed_rate@200ms",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pyth/, ""),
      },
      "/api/arena": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/arena/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/api/pyth": {
        target: "https://pyth.dourolabs.app/v1/fixed_rate@200ms",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pyth/, ""),
      },
      "/api/arena": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/arena/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
