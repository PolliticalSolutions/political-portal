import { Link } from "react-router-dom";
import Footer from "../components/Footer.jsx";
import { getAllPosts } from "../blog/blogLoader.js";
import { formatBlogDate } from "../blog/formatBlogDate.js";
import { getBlogEffectiveDate } from "../blog/postDates.js";

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="page">
      <section className="section">
        <div className="container stack">
          <h1>Blog</h1>
          <p className="muted">
            Latest writing on campaign operations, data delivery, and practical execution patterns for
            political teams.
          </p>
        </div>
      </section>

      <section className="section tight">
        <div className="container stack">
          {posts.map((post) => (
            <article className="card stack blog-card" key={post.slug}>
              <div className="stack" style={{ gap: 8 }}>
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

      <Footer />
    </div>
  );
}
