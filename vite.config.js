import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Treat .geojson files as plain JSON modules so they can be directly imported
// in client-only chunks (ConstituencyMapClient.jsx) without a runtime HTTP fetch.
const geojsonPlugin = {
  name: "geojson",
  transform(src, id) {
    if (id.endsWith(".geojson")) {
      return { code: `export default ${src}`, map: null };
    }
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serviceRoleKey =
    process.env.VITE_SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_SERVICE_KEY || "";
  if (serviceRoleKey.trim()) {
    throw new Error(
      "Refusing to build: VITE_SUPABASE_SERVICE_KEY is a privileged server credential and cannot be exposed by a Vite client build."
    );
  }

  return {
  plugins: [react(), geojsonPlugin],
  ssr: {
    noExternal: ["react-helmet-async"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase")) return "vendor-supabase";
          if (
            id.includes("node_modules/react-simple-maps") ||
            id.includes("node_modules/d3-") ||
            id.includes("node_modules/topojson")
          )
            return "vendor-maps";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/react/")
          )
            return "vendor-react";
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    include: ["src/**/*.test.{js,jsx,ts,tsx}", "scripts/**/*.test.{js,mjs}"],
    exclude: ["infra/enquiry-api/test/**", "node_modules/**", "dist/**"],
    pool: "vmThreads",
    alias: {
      "react-router-dom": new URL("./node_modules/react-router-dom/dist/index.mjs", import.meta.url).pathname,
    },
    disableConsoleIntercept: true,
  },
  };
});
