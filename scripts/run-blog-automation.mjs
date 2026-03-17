import { runScheduledBlogPipeline } from "./blog-automation.mjs";

const envFlag = (name, fallback) => {
  const value = process.env[name];
  if (value == null || value === "") {
    return fallback;
  }
  return value === "1" || value === "true";
};

runScheduledBlogPipeline({
  autoPublish: envFlag("AUTO_PUBLISH", false),
  requireClaudeReview: envFlag("REQUIRE_CLAUDE_REVIEW", true),
  requireHumanReview: envFlag("REQUIRE_HUMAN_REVIEW", true),
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("Blog automation failed:", error);
    process.exitCode = 1;
  });
