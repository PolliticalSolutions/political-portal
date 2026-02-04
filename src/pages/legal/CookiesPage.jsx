import Card from "../../components/Card.jsx";
import Footer from "../../components/Footer.jsx";

export default function CookiesPage() {
  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Cookie Notice</h1>
            <p className="muted">
              Political Solutions Ltd (UK) uses essential storage to keep the portal secure and usable. We do not
              use advertising or tracking cookies.
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span>Cookie summary</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Essential storage placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <Card>
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
                  Questions? Email <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
