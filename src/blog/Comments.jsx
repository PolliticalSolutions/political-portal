import Giscus from "@giscus/react";

const readProcessEnv = (key) =>
  typeof process !== "undefined" && process.env ? process.env[key] : undefined;

const readEnv = () => ({
  VITE_GISCUS_REPO:
    import.meta.env.VITE_GISCUS_REPO ?? readProcessEnv("VITE_GISCUS_REPO"),
  VITE_GISCUS_REPO_ID:
    import.meta.env.VITE_GISCUS_REPO_ID ?? readProcessEnv("VITE_GISCUS_REPO_ID"),
  VITE_GISCUS_CATEGORY:
    import.meta.env.VITE_GISCUS_CATEGORY ?? readProcessEnv("VITE_GISCUS_CATEGORY"),
  VITE_GISCUS_CATEGORY_ID:
    import.meta.env.VITE_GISCUS_CATEGORY_ID ?? readProcessEnv("VITE_GISCUS_CATEGORY_ID"),
  VITE_GISCUS_ENABLED:
    import.meta.env.VITE_GISCUS_ENABLED ?? readProcessEnv("VITE_GISCUS_ENABLED"),
});

export const resolveGiscusConfig = (env = readEnv()) => {
  const repo = env.VITE_GISCUS_REPO || "";
  const repoId = env.VITE_GISCUS_REPO_ID || "";
  const category = env.VITE_GISCUS_CATEGORY || "";
  const categoryId = env.VITE_GISCUS_CATEGORY_ID || "";
  const explicitEnabled =
    typeof env.VITE_GISCUS_ENABLED === "string"
      ? env.VITE_GISCUS_ENABLED.toLowerCase() === "true"
      : true;

  const configured = [repo, repoId, category, categoryId].every((value) => Boolean(value));

  return {
    enabled: explicitEnabled && configured,
    repo,
    repoId,
    category,
    categoryId,
  };
};

export default function Comments({ slug, envOverride }) {
  const config = resolveGiscusConfig(envOverride || readEnv());

  if (!config.enabled || !slug) {
    return null;
  }
  if (typeof window === "undefined") {
    return null;
  }

  return (
    <section className="blog-comments" aria-label="Comments">
      <h2 className="section-title" style={{ marginBottom: 12 }}>
        Comments
      </h2>
      <Giscus
        id="blog-giscus"
        repo={config.repo}
        repoId={config.repoId}
        category={config.category}
        categoryId={config.categoryId}
        mapping="specific"
        term={slug}
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        theme="light"
        lang="en"
        loading="lazy"
      />
      <p className="helper" style={{ marginTop: 10 }}>
        Comments are powered by GitHub Discussions (Giscus). This may set cookies or local
        storage via GitHub to remember your preferences.
      </p>
    </section>
  );
}
