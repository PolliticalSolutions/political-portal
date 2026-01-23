import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
