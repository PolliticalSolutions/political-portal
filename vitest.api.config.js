import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "infra/enquiry-api/test/**/*.test.mjs",
      "infra/upload-api/test/**/*.test.mjs",
    ],
  },
});
