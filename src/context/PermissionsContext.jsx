import { createContext, useContext, useEffect, useState } from "react";
import { getUserConstituencies } from "../lib/permissionsApi.js";
import { isAdmin as checkIsAdmin } from "../lib/subscriptionApi.js";

const PermissionsContext = createContext({
  /** null = not yet loaded; [] = loaded but none; [{id,name,ons_code}] = loaded */
  allowedConstituencies: null,
  loading: false,
  error: null,
  isAdmin: false,
  reload: () => {},
});

export function PermissionsProvider({ cognitoSub, children }) {
  const [allowedConstituencies, setAllowedConstituencies] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!cognitoSub) {
      setAllowedConstituencies([]);
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getUserConstituencies(cognitoSub),
      checkIsAdmin(cognitoSub),
    ])
      .then(([cons, admin]) => {
        if (!cancelled) {
          setAllowedConstituencies(cons);
          setIsAdmin(admin);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load permissions.");
          setAllowedConstituencies([]);
          setIsAdmin(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cognitoSub, tick]);

  return (
    <PermissionsContext.Provider
      value={{
        allowedConstituencies,
        loading,
        error,
        isAdmin,
        reload: () => setTick((t) => t + 1),
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
