import ConferencePage from "../pages/ConferencePage.jsx";

export default function ConferenceShell() {
  return (
    <div className="app public-site conference-site">
      <a className="skip-link" href="#conference-content">Skip to content</a>
      <main className="content" id="conference-content">
        <ConferencePage />
      </main>
    </div>
  );
}
