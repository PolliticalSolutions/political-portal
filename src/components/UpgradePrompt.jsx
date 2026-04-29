import { Link } from "react-router-dom";
import Button from "./Button.jsx";
import Card from "./Card.jsx";
import { calculateAssociationSubscriptionPricing, formatPenceToPounds } from "../lib/subscriptionPricing.js";

export default function UpgradePrompt({
  missing = "This constituency is not included in your subscription",
  constituencyCount = 1,
  ctaLabel = "Upgrade your subscription",
}) {
  const pricing = calculateAssociationSubscriptionPricing(constituencyCount);

  return (
    <Card>
      <div className="upgrade-prompt" role="region" aria-label="Subscription upgrade required">
        <div className="upgrade-prompt__content">
          <span className="upgrade-prompt__eyebrow">Subscription required</span>
          <h1 className="upgrade-prompt__title">{missing}</h1>
          <p className="upgrade-prompt__body">
            Unlock constituency intelligence for this area from £{formatPenceToPounds(pricing.amountExVatPence)}
            {" "}+ VAT per year.
          </p>
        </div>
        <div className="upgrade-prompt__action">
          <Button as={Link} to="/subscribe" variant="primary">
            {ctaLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
