import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="container footer-inner">
        <div className="footer-panel">
          <div className="footer-heading">Political Solutions Ltd</div>
          <p className="muted" style={{ marginTop: 8, maxWidth: 42 + "ch" }}>
            Political data products and operational support for campaign teams, associations, and
            headquarters functions.
          </p>
        </div>
        <div className="footer-panel">
          <div className="footer-heading">Products</div>
          <div className="footer-links" style={{ marginTop: 8 }}>
            <Link to="/subscriptions">Marked Register Processing</Link>
            <Link to="/enquire">Constituency Intelligence</Link>
            <Link to="/services/election-support">Campaigning Support</Link>
          </div>
        </div>
        <div className="footer-panel">
          <div className="footer-heading">Contact</div>
          <div className="footer-links" style={{ marginTop: 8 }}>
            <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
            <span className="muted">Working with UK-wide clients</span>
          </div>
        </div>
        <div className="footer-panel">
          <div className="footer-heading">Trust and compliance</div>
          <div className="footer-links" style={{ marginTop: 8 }}>
            <span className="muted">
              Secure portal access, scoped delivery, and client responsibility for electoral compliance are built
              into the workflow.
            </span>
          </div>
        </div>
      </div>
      <div className="container footer-legal">
        <Link to="/blog">Blog</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Use</Link>
        <Link to="/cookies">Cookie notice</Link>
      </div>
    </footer>
  );
}
