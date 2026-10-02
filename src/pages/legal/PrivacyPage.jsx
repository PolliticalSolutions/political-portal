import Card from "../../components/Card.jsx";
import Footer from "../../components/PublicFooter.jsx";
import logo from "../../assets/brand/political-solutions-logo.png";

export default function PrivacyPage() {
  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Privacy Policy</h1>
            <p className="muted">
              Startin Sales Solutions Ltd T/A Political Solutions respects your privacy. This policy explains what we collect, why we
              collect it, and how you can contact us with questions.
            </p>
          </div>
          <div
            className="hero-visual"
            aria-hidden="true"
            style={{ background: "#0a3b7c", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, minHeight: 180 }}
          >
            <img src={logo} alt="" style={{ maxWidth: 160, opacity: 0.9 }} />
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <Card>
            <div className="stack" style={{ marginTop: 16, gap: 12 }}>
              <div>
                <strong>Data we collect</strong>
                <p className="muted">
                  Account identifiers, sign-in metadata, and basic usage information needed to operate the portal.
                  We only request what is required for access control and service delivery.
                </p>
                <div id="enquiries">
                  <h2>Conference enquiries</h2>
                  <p className="muted">
                    Startin Sales Solutions Ltd T/A Political Solutions is the controller of conference enquiry data.
                    With your consent, we collect your name, email, optional organisation and message to respond to
                    your enquiry. Your explicit consent also covers any political affiliation you choose to include.
                    We rely on UK GDPR Article 6(1)(a) and, where this reveals political opinions, Article 9(2)(a).
                    Please do not include other people’s personal information or confidential voter information.
                  </p>
                  <p className="muted">
                    Only if you separately opt in may Paul also email you about relevant campaign services and the
                    next conference season. This is optional and does not affect your enquiry. We keep conference
                    enquiries for up to 12 months from submission, then delete them. You can withdraw either consent
                    at any time by emailing <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>;
                    withdrawal does not affect processing already carried out lawfully. We will stop the relevant
                    contact and delete enquiry data when consent is withdrawn, unless we must retain it by law.
                  </p>
                  <p className="muted">
                    Supabase stores these records and AWS processes submissions and may deliver an email notification
                    to Paul. Access is restricted. Exported records and notification emails are subject to the same
                    retention and withdrawal rules. We record consent choices, their wording version and submission
                    time. For abuse prevention we temporarily process an IP-derived identifier, deleted within
                    24 hours by scheduled cleanup. We rely on our legitimate interest in protecting the service
                    from abuse for this limited processing. We do not save your browser user agent or referring page with
                    your enquiry. Cookie-free daily counts measure page visits and completed submissions; these
                    aggregate counts contain no contact details and may be retained after enquiry records are deleted.
                  </p>
                  <p className="muted">
                    You may object to processing based on legitimate interests, or request access, correction,
                    deletion, restriction or a portable copy of your enquiry data
                    using the email above. You may also complain to the <a href="https://ico.org.uk/make-a-complaint/">Information Commissioner’s Office</a>.
                  </p>
                </div>
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
                  For privacy questions, email <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
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
