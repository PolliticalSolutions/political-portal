import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import { getAllPosts } from "../blog/blogLoader.js";
import { formatBlogDate } from "../blog/formatBlogDate.js";
import { getBlogEffectiveDate } from "../blog/postDates.js";

export default function BlogIndexPage({ postsOverride }) {
  const posts = postsOverride ?? getAllPosts();

  return (
    <div className="page blog-page blog-index-page">
      <section className="blog-section blog-hero-section" aria-labelledby="blog-index-title">
        <div className="container blog-index-hero">
          <div className="blog-index-hero__marker">
            <p className="blog-eyebrow">Political Solutions briefings</p>
            <span aria-hidden="true" />
          </div>
          <div className="blog-index-hero__copy">
            <h1 id="blog-index-title">Campaign operations, from evidence to delivery</h1>
            <p className="blog-index-intro">
              Political Solutions publishes practical briefings on campaign planning,
              constituency evidence, data handling and delivery.
            </p>
            <p className="blog-index-supporting">
              Each briefing focuses on a defined operational problem, the decisions campaign
              teams need to make and the controls that keep work on track.
            </p>
          </div>
        </div>
      </section>

      <section className="blog-section blog-collection" aria-labelledby="blog-collection-title">
        <div className="container">
          <header className="blog-collection__header">
            <h2 id="blog-collection-title">Campaign briefings</h2>
            <p>
              Browse briefings on campaign management, constituency evidence, marked-register
              work and operational delivery.
            </p>
          </header>

          {posts.length > 0 ? (
            <ol className="blog-index-list">
              {posts.map((post) => {
                const publishedDate = getBlogEffectiveDate(post.meta);
                return (
                  <li key={post.slug}>
                    <article className="blog-card">
                      <p className="blog-card__date">
                        Published <time dateTime={publishedDate}>{formatBlogDate(publishedDate)}</time>
                      </p>
                      <div className="blog-card__content">
                        <h3 className="blog-title-link">
                          <Link to={`/blog/${post.slug}`}>{post.meta.title}</Link>
                        </h3>
                        <p>{post.meta.description}</p>
                      </div>
                      {post.meta.tags.length > 0 && (
                        <div className="blog-card__topics">
                          <span>Topics</span>
                          <ul aria-label={`Topics for ${post.meta.title}`}>
                            {post.meta.tags.map((tag) => (
                              <li key={`${post.slug}-${tag}`}>{tag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="blog-empty" role="status">
              <h3>No campaign briefings are published yet</h3>
              <p>There are no published briefings to show.</p>
            </div>
          )}
        </div>
      </section>

      <section className="blog-section blog-closing" aria-labelledby="blog-closing-title">
        <div className="container blog-closing__panel">
          <div>
            <h2 id="blog-closing-title">Bring the next campaign decision into focus</h2>
            <p>
              Tell Political Solutions about the campaign, constituencies or operational
              challenge you are working on.
            </p>
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
