import { Link } from "react-router-dom";
import footerLockup from "../assets/brand/ps-lockup-dark-outlined.svg";

export default function PublicFooter() {
  return (
    <footer className="public-footer" id="contact">
      <div className="container public-footer__grid">
        <div className="public-footer__identity">
          <Link to="/" aria-label="Political Solutions home">
            <img
              className="public-footer__logo"
              src={footerLockup}
              alt="Political Solutions"
              height="64"
              loading="lazy"
            />
          </Link>
          <p>
            Political data products and operational support for Conservative campaign teams.
          </p>
        </div>

        <div className="public-footer__group">
          <h2>Products</h2>
          <nav aria-label="Footer products">
            <Link to="/subscribe">Marked Register Processing</Link>
            <Link to="/constituency-intelligence">Constituency Intelligence</Link>
            <Link to="/services/election-support">Campaigning, Training &amp; Election Support</Link>
          </nav>
        </div>

        <div className="public-footer__group">
          <h2>Company &amp; account</h2>
          <nav aria-label="Footer company and account">
            <Link to="/blog">Blog</Link>
            <Link to="/enquire">Contact</Link>
            <Link to="/login">Client login</Link>
          </nav>
        </div>

        <div className="public-footer__group">
          <h2>Contact</h2>
          <div className="public-footer__links">
            <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
            <span>UK-wide support</span>
          </div>
        </div>
      </div>

      <div className="container public-footer__legal">
        <p>Startin Sales Solutions Ltd, trading as Political Solutions.</p>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of use</Link>
          <Link to="/cookies">Cookie notice</Link>
        </nav>
      </div>
    </footer>
  );
}
