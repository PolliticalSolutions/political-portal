import { Link } from "react-router-dom";
import Card from "../../components/Card.jsx";

export default function PortalNotFound() {
  return (
    <div className="page stack">
      <Card>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Page not found</h1>
        <p className="muted" style={{ marginBottom: 12 }}>
          The portal page you are looking for does not exist.
        </p>
        <Link className="navLink" to="/portal">
          Back to portal home
        </Link>
      </Card>
    </div>
  );
}
