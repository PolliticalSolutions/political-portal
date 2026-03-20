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
      console.log("[PermissionsContext] No cognitoSub received; returning empty constituency list.", {
        cognitoSub,
      });
      setAllowedConstituencies([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[PermissionsContext] Loading user constituencies.", { cognitoSub });
    getUserConstituencies(cognitoSub)
      .then((cons) => {
        console.log("[PermissionsContext] getUserConstituencies raw response.", {
          cognitoSub,
          response: cons,
        });
        if (!cancelled) setAllowedConstituencies(cons);
      })
      .catch((err) => {
        console.error("[PermissionsContext] getUserConstituencies failed.", {
          cognitoSub,
          error: err,
          message: err?.message || "Failed to load permissions.",
        });
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
