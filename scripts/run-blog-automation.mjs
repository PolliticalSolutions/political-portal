import { runScheduledBlogPipeline } from "./blog-automation.mjs";

runScheduledBlogPipeline()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("Blog automation failed:", error);
    process.exitCode = 1;
  });
