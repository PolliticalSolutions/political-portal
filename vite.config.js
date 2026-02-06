import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: ["react-helmet-async"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://politicalsolutions.uk",
      },
    },
    env: {
      VITE_SITE_URL: "https://politicalsolutions.uk",
    },
    setupFiles: "./src/setupTests.js",
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    exclude: ["infra/enquiry-api/test/**", "node_modules/**", "dist/**"],
    cache: false,
    disableConsoleIntercept: true,
  },
});
