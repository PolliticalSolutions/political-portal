import ReactMarkdown from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Button from "../components/Button.jsx";
import Footer from "../components/Footer.jsx";
import { getPostBySlug } from "../blog/blogLoader.js";
import { formatBlogDate } from "../blog/formatBlogDate.js";
import { getBlogEffectiveDate } from "../blog/postDates.js";
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
  const publishedDate = getBlogEffectiveDate(post.meta);
  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.meta.title,
    datePublished: publishedDate,
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

          <header className="blog-post-header stack" style={{ gap: 8 }}>
            <div className="blog-post-header__meta">
              <span className="blog-post-header__label">Operational briefing</span>
              <p className="muted blog-meta">
                {formatBlogDate(publishedDate)} | {post.meta.author}
              </p>
            </div>
            <h1 id="blog-post-title">{post.meta.title}</h1>
            <p className="blog-post-header__description">{post.meta.description}</p>
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

      <section className="section">
        <div className="container cta-section">
          <div>
            <h2>Ready to talk campaign delivery?</h2>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/enquire" variant="primary">
              Request a briefing
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
