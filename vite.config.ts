import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // globPatterns includes these once; includeAssets would duplicate entries.
      includeAssets: [],
      includeManifestIcons: false,
      manifest: {
        id: "./",
        name: "秋四色 · Four Shades of Autumn",
        short_name: "秋四色",
        description: "单机回合制策略游戏",
        lang: "zh-CN",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#d5dcd6",
        theme_color: "#254d5a",
        categories: ["games", "strategy"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Include worker chunks as well as UI chunks. No gameplay request needs a server.
        globPatterns: [
          "**/*.{js,css,html,png,svg,ico,json,webmanifest,woff,woff2,wasm,mp3,wav,ogg}",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: "node", include: ["agent/tests/**/*.test.ts"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber"],
          react: ["react", "react-dom", "zustand"],
        },
      },
    },
  },
});
