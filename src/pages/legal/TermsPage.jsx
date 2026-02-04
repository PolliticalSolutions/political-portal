import Card from "../../components/Card.jsx";
import Footer from "../../components/Footer.jsx";

export default function TermsPage() {
  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Terms of Use</h1>
            <p className="muted">
              These terms govern access to the Political Solutions Ltd (UK) portal and related services. By using
              the site you agree to these terms.
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span>Terms overview</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Usage guidance placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <Card>
            <div className="stack" style={{ marginTop: 16, gap: 12 }}>
              <div>
                <strong>Access and accounts</strong>
                <p className="muted">
                  Keep sign-in credentials secure and notify us if you suspect unauthorised access. Access is
                  provided for approved users only.
                </p>
              </div>
              <div>
                <strong>Acceptable use</strong>
                <p className="muted">
                  Do not misuse the platform, attempt to bypass security controls, or upload unlawful content.
                </p>
              </div>
              <div>
                <strong>Availability</strong>
                <p className="muted">
                  We aim to keep the service available but cannot guarantee uninterrupted access. Planned
                  maintenance will be communicated where possible.
                </p>
              </div>
              <div>
                <strong>Contact</strong>
                <p className="muted">
                  For questions about these terms, email <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
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
