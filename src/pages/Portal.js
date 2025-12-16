export default function Portal() {
  return (
    <div className="container">
      <h1>Portal</h1>
      <p className="lead">
        Operational overview and tools for authorised users.
      </p>

      <div className="grid">
        <div className="card">
          <h3>Federations</h3>
          <p>
            Manage federations, constituencies and pricing rules.
          </p>
        </div>

        <div className="card">
          <h3>Data processing</h3>
          <p>
            Upload, validate and process marked registers.
          </p>
        </div>

        <div className="card">
          <h3>Billing</h3>
          <p>
            Automated pricing and invoicing via Xero.
          </p>
        </div>
      </div>

      <div className="section">
        <h2 className="sectionTitle">Coming next</h2>
        <ul className="list">
          <li>User roles and permissions</li>
          <li>Federation-level reporting</li>
          <li>Secure data exports</li>
        </ul>
      </div>
    </div>
  );
}
