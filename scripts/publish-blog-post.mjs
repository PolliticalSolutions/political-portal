import { publishBlogPost } from "./blog-automation.mjs";

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

if (!args.slug) {
  console.error("Usage: node scripts/publish-blog-post.mjs --slug <slug>");
  process.exit(1);
}

publishBlogPost({
  slug: args.slug,
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("Failed to publish blog post:", error);
    process.exitCode = 1;
  });
