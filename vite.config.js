import { defineConfig } from "vite";
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

export default defineConfig({
  plugins: [react(), geojsonPlugin],
  ssr: {
    noExternal: ["react-helmet-async"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    exclude: ["infra/enquiry-api/test/**", "node_modules/**", "dist/**"],
    cache: false,
    disableConsoleIntercept: true,
  },
});
