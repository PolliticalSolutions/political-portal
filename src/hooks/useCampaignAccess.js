// Resolves the user's campaign-module access profile (admin, campaign
// manager, volunteer coordinator, regional viewer, region membership)
// and caches it for the portal session.

import { useEffect, useState } from "react";
import { getSession } from "../auth/session.js";
import { getCampaignAccess } from "../lib/campaignApi.js";

export function useCampaignAccess() {
  const [state, setState] = useState({
    loading: true,
    access: null,
    cognitoSub: null,
    userEmail: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const session = getSession();
    const sub = session && session.user && session.user.sub;
    const email = session && session.user && session.user.email;
    if (!sub) {
      if (!cancelled) setState({ loading: false, access: null, cognitoSub: null, userEmail: null, error: null });
      return () => { cancelled = true; };
    }

    getCampaignAccess(sub, email)
      .then((access) => {
        if (cancelled) return;
        setState({ loading: false, access, cognitoSub: sub, userEmail: email || null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, access: null, cognitoSub: sub, userEmail: email || null, error: err.message });
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
