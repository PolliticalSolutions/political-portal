import Badge from "./Badge.jsx";
import Button from "./Button.jsx";
import Card from "./Card.jsx";

export default function IdleWarning({ secondsLeft, onStay, onLogout }) {
  return (
    <div className="idle-overlay" role="dialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="idle-modal">
        <Card
          className="idle-card"
          title={
            <div id="idle-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              Still there?
              <Badge tone="accent">Auto log-out</Badge>
            </div>
          }
        >
          <p className="muted">
            You have been inactive for a few minutes. You will be logged out unless you continue your
            session.
          </p>

          <div className="idle-countdown" aria-live="polite">
            <div className="idle-timer">{secondsLeft}s</div>
            <div className="muted">Logging you out in {secondsLeft} seconds unless there is activity.</div>
          </div>

          <div className="idle-actions">
            <Button variant="secondary" onClick={onLogout}>
              Log out now
            </Button>
            <Button onClick={onStay}>Stay signed in</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
