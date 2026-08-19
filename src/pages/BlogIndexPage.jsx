import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import { getAllPosts } from "../blog/blogLoader.js";
import { formatBlogDate } from "../blog/formatBlogDate.js";
import { getBlogEffectiveDate } from "../blog/postDates.js";

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="page">
      <section className="section">
        <div className="container stack">
          <div className="blog-index-hero">
            <h1>UK Campaign Operations Blog</h1>
            <p className="blog-index-intro">
              Operational guidance for UK campaign professionals who need practical answers on data handling,
              marked registers, constituency research, and delivery discipline rather than generic political
              commentary.
            </p>
            <p className="muted">
              Articles focus on workflows, decision points, and avoidable operational mistakes across campaign
              teams, associations, and headquarters functions.
            </p>
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container stack">
          <div className="blog-index-section-header">
            <h2 className="section-title">Latest operational guidance</h2>
            <p className="muted">
              Published notes from the Political Solutions team on campaign operations and constituency work.
            </p>
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container stack">
          {posts.map((post) => (
            <article className="card stack blog-card" key={post.slug}>
              <div className="stack blog-card__content" style={{ gap: 8 }}>
                <h2 className="card-title blog-title-link">
                  <Link to={`/blog/${post.slug}`}>{post.meta.title}</Link>
                </h2>
                <p className="muted blog-meta">{formatBlogDate(getBlogEffectiveDate(post.meta))}</p>
                <p className="muted">{post.meta.description}</p>
              </div>
              {post.meta.tags.length > 0 && (
                <div className="blog-tags" aria-label="Tags">
                  {post.meta.tags.map((tag) => (
                    <span key={`${post.slug}-${tag}`} className="badge">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container cta-section">
          <div>
            <h2>Ready to talk campaign delivery?</h2>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/enquire?service=platform-briefing" variant="primary">
              Request a briefing
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
