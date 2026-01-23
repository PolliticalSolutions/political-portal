import Card from "../../components/Card.jsx";
import Footer from "../../components/Footer.jsx";

export default function CookiesPage() {
  return (
    <div className="page stack">
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Cookie Notice</h1>
        <p className="muted">
          Political Solutions Ltd (UK) uses essential storage to keep the portal secure and usable. We do not
          use advertising or tracking cookies.
        </p>
        <div className="stack" style={{ marginTop: 16, gap: 12 }}>
          <div>
            <strong>Essential storage</strong>
            <p className="muted">
              We store session and authentication data to keep you signed in and to protect the service. This
              includes secure tokens and session metadata.
            </p>
          </div>
          <div>
            <strong>Preferences</strong>
            <p className="muted">
              We may store basic preferences like dismissal of this notice to avoid showing it repeatedly.
            </p>
          </div>
          <div>
            <strong>Contact</strong>
            <p className="muted">
              Questions? Email{" "}
              <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
            </p>
          </div>
        </div>
      </Card>
      <Footer />
    </div>
  );
}
