import { defineConfig } from "vite";

export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
  server: {
    // In dev, proxy /api/* to the Flask server running on :8765
    proxy: {
      '/api': 'http://localhost:8765',
    },
  },
});
