import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer">
      <span>Political Solutions Ltd (UK)</span>
      <span>
        Contact: <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
      </span>
      <span className="footer-links">
        <Link to="/privacy">Privacy Policy</Link> | <Link to="/terms">Terms of Use</Link> |{" "}
        <Link to="/cookies">Cookie Notice</Link>
      </span>
    </footer>
  );
}
