import Card from "../../components/Card.jsx";
import Footer from "../../components/Footer.jsx";
import Seo from "../../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../../seo/structuredData.js";

export default function TermsPage() {
  return (
    <div className="page stack">
      <Seo
        title="Terms of use"
        description="Terms of use for the Political Solutions Portal and related services."
        path="/terms"
        robots="index,follow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Terms of Use</h1>
        <p className="muted">
          These terms govern access to the Political Solutions Ltd (UK) portal and related services. By using
          the site you agree to these terms.
        </p>
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
              For questions about these terms, email{" "}
              <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
            </p>
          </div>
        </div>
      </Card>
      <Footer />
    </div>
  );
}
