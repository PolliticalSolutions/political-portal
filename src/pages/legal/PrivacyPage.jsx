import Card from "../../components/Card.jsx";
import Footer from "../../components/Footer.jsx";
import Seo from "../../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../../seo/structuredData.js";

export default function PrivacyPage() {
  return (
    <div className="page stack">
      <Seo
        title="Privacy policy"
        description="Read how Political Solutions Ltd handles data, privacy, and contact details."
        path="/privacy"
        robots="index,follow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Privacy Policy</h1>
        <p className="muted">
          Political Solutions Ltd (UK) respects your privacy. This policy explains what we collect, why we
          collect it, and how you can contact us with questions.
        </p>
        <div className="stack" style={{ marginTop: 16, gap: 12 }}>
          <div>
            <strong>Data we collect</strong>
            <p className="muted">
              Account identifiers, sign-in metadata, and basic usage information needed to operate the portal.
              We only request what is required for access control and service delivery.
            </p>
          </div>
          <div>
            <strong>How we use data</strong>
            <p className="muted">
              Data is used to authenticate users, secure access, respond to enquiries, and improve our
              services. We do not sell personal data.
            </p>
          </div>
          <div>
            <strong>Data sharing</strong>
            <p className="muted">
              We use trusted infrastructure providers to host and secure the service. Data is shared only as
              needed to operate the platform or comply with legal obligations.
            </p>
          </div>
          <div>
            <strong>Contact</strong>
            <p className="muted">
              For privacy questions, email{" "}
              <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
            </p>
          </div>
        </div>
      </Card>
      <Footer />
    </div>
  );
}
