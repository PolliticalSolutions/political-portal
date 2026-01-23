import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="container footer-inner">
        <div>
          <div style={{ fontWeight: 700, color: "var(--primary)" }}>Political Solutions Ltd</div>
          <p className="muted" style={{ marginTop: 8, maxWidth: 42 + "ch" }}>
            UK-wide political operations support, data insights, and subscription tooling.
          </p>
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--primary)" }}>Contact</div>
          <div className="footer-links" style={{ marginTop: 8 }}>
            <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
            <span className="muted">Working with UK-wide clients</span>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--primary)" }}>Resources</div>
          <div className="footer-links" style={{ marginTop: 8 }}>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Use</Link>
            <Link to="/cookies">Cookie Notice</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
