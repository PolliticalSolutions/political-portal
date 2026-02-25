import ReactMarkdown from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Footer from "../components/Footer.jsx";
import { getPostBySlug } from "../blog/blogLoader.js";
import { formatBlogDate } from "../blog/formatBlogDate.js";
import Comments from "../blog/Comments.jsx";
import { SITE_URL } from "../seo/seoConfig.js";

const isDraftPreviewEnabled = (search) => {
  if (!import.meta.env.DEV) {
    return false;
  }

  const params = new URLSearchParams(search);
  const value = params.get("includeDrafts");
  return value === "1" || value === "true";
};

export default function BlogPostPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const includeDrafts = isDraftPreviewEnabled(location.search);
  const post = getPostBySlug(slug, { includeDrafts });

  if (!post) {
    return (
      <div className="page">
        <section className="section">
          <div className="container stack">
            <h1>Post not found</h1>
            <p className="muted">This article is unavailable or has not been published.</p>
            <Link className="blog-inline-link" to="/blog">
              Back to blog
            </Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const canonicalUrl = post.meta.canonical || `${SITE_URL}/blog/${post.slug}`;
  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.meta.title,
    datePublished: post.meta.date,
    author: {
      "@type": "Organization",
      name: post.meta.author,
    },
    mainEntityOfPage: canonicalUrl,
    description: post.meta.description,
    publisher: {
      "@type": "Organization",
      name: "Political Solutions",
      url: SITE_URL,
    },
  };

  return (
    <div className="page">
      <section className="section">
        <article className="container stack blog-post" aria-labelledby="blog-post-title">
          <Helmet>
            <script type="application/ld+json">{JSON.stringify(blogPostingJsonLd)}</script>
          </Helmet>
          <Link className="blog-inline-link" to="/blog">
            Back to blog
          </Link>

          <header className="stack" style={{ gap: 8 }}>
            <h1 id="blog-post-title">{post.meta.title}</h1>
            <p className="muted blog-meta">
              {formatBlogDate(post.meta.date)} | {post.meta.author}
            </p>
            {post.meta.tags.length > 0 && (
              <div className="blog-tags" aria-label="Tags">
                {post.meta.tags.map((tag) => (
                  <span key={`${post.slug}-${tag}`} className="badge">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="blog-markdown">
            <ReactMarkdown>{post.content}</ReactMarkdown>
          </div>

          {post.meta.canonical && (
            <p className="muted">
              Originally published at{" "}
              <a className="blog-inline-link" href={post.meta.canonical}>
                {post.meta.canonical}
              </a>
              .
            </p>
          )}

          <Comments slug={post.slug} />
        </article>
      </section>
      <Footer />
    </div>
  );
}
