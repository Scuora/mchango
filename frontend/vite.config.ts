import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the management listener serves the API. The Host header is
// left unchanged so the backend's host check sees "localhost".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Root-relative, so no Node path helpers (and no @types/node) are needed.
    alias: { "@": "/src" },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8081", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
