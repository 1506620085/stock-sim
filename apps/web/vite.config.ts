import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appRoutes = new Set(["/replay", "/calculators", "/stats", "/notes", "/settings"]);

export default defineConfig({
  plugins: [
    react(),
    {
      name: "stock-sim-spa-routes",
      configurePreviewServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url && appRoutes.has(request.url.split("?")[0])) {
            request.url = "/";
          }
          next();
        });
      },
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url && appRoutes.has(request.url.split("?")[0])) {
            request.url = "/";
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
