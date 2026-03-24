import { createContext, useContext, useEffect, useState } from "react";
import { getUserConstituencies } from "../lib/permissionsApi.js";

const PermissionsContext = createContext({
  /** null = not yet loaded; [] = loaded but none; [{id,name,ons_code}] = loaded */
  allowedConstituencies: null,
  loading: false,
  error: null,
  reload: () => {},
});

export function PermissionsProvider({ cognitoSub, children }) {
  const [allowedConstituencies, setAllowedConstituencies] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!cognitoSub) {
      setAllowedConstituencies([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUserConstituencies(cognitoSub)
      .then((cons) => {
        if (!cancelled) setAllowedConstituencies(cons);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load permissions.");
          setAllowedConstituencies([]);
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
