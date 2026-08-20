import { Link, useLocation, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import BlogMarkdown from "../blog/BlogMarkdown.jsx";
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
      <div className="page blog-page blog-post-page">
        <section className="blog-section blog-unavailable">
          <div className="container blog-unavailable__content">
            <h1>Briefing unavailable</h1>
            <p>This briefing does not exist or has not been published.</p>
            <Link className="blog-inline-link" to="/blog">
              View all campaign briefings
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
    <div className="page blog-page blog-post-page">
      <article aria-labelledby="blog-post-title">
        <section className="blog-section blog-article-hero">
          <div className="container blog-post">
            <Helmet>
              <script type="application/ld+json">{JSON.stringify(blogPostingJsonLd)}</script>
            </Helmet>
            <Link className="blog-inline-link" to="/blog">
              <span aria-hidden="true">←</span> All campaign briefings
            </Link>

            <header className="blog-post-header">
              <div className="blog-post-header__meta">
                <span className="blog-post-header__label">Campaign briefing</span>
                <dl className="blog-post-meta">
                  <div>
                    <dt>Published</dt>
                    <dd>
                      <time dateTime={publishedDate}>{formatBlogDate(publishedDate)}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>By</dt>
                    <dd>{post.meta.author}</dd>
                  </div>
                </dl>
              </div>
              <h1 id="blog-post-title">{post.meta.title}</h1>
              <p className="blog-post-header__description">{post.meta.description}</p>
              {post.meta.tags.length > 0 && (
                <div className="blog-post-topics">
                  <span>Topics</span>
                  <ul aria-label={`Topics for ${post.meta.title}`}>
                    {post.meta.tags.map((tag) => (
                      <li key={`${post.slug}-${tag}`}>{tag}</li>
                    ))}
                  </ul>
                </div>
              )}
            </header>
          </div>
        </section>

        <section className="blog-section blog-article-body">
          <div className="container blog-reading-column">
            <BlogMarkdown content={post.content} />

            {post.meta.canonical && (
              <aside className="blog-original-publication" aria-label="Original publication">
                <span>Original publication</span>
                <a className="blog-inline-link" href={post.meta.canonical}>
                  View the original article
                </a>
              </aside>
            )}

            <Comments slug={post.slug} />
          </div>
        </section>
      </article>

      <section className="blog-section blog-closing" aria-labelledby="blog-post-closing-title">
        <div className="container blog-closing__panel">
          <div>
            <h2 id="blog-post-closing-title">Apply this briefing to your campaign</h2>
            <p>Discuss the campaign job, data requirement or delivery challenge you need to resolve.</p>
          </div>
          <div className="blog-closing__action">
            <Button as={Link} to="/enquire?service=election-support" variant="primary">
              Discuss your campaign
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
