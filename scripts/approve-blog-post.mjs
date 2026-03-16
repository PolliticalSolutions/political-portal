import { recordHumanReviewDecision } from "./blog-automation.mjs";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    args[item.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));

if (!args.slug || !args.reviewer || !args.decision) {
  console.error("Usage: node scripts/approve-blog-post.mjs --slug <slug> --reviewer <name> --decision <Publish|Revise|Discard> [--notes <text>]");
  process.exit(1);
}

recordHumanReviewDecision({
  slug: args.slug,
  reviewer: args.reviewer,
  decision: args.decision,
  notes: args.notes || "",
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("Failed to record human review decision:", error);
    process.exitCode = 1;
  });
