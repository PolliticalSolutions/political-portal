import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const ackKey = "ps_cookie_notice_ack_v1";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hasAck = typeof window !== "undefined" && localStorage.getItem(ackKey) === "true";
    setVisible(!hasAck);
  }, []);

  const handleAck = () => {
    localStorage.setItem(ackKey, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="region" aria-label="Cookie notice">
      <div className="cookie-banner__content">
        <span>
          We use essential local storage to support sign-in and basic functionality.{" "}
          <Link to="/cookies">Learn more</Link>.
        </span>
        <button type="button" className="button secondary" onClick={handleAck}>
          OK
        </button>
      </div>
    </div>
  );
}
