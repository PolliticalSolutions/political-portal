import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { buildPersona } from "../../lib/personaApi.js";

const STORAGE_KEY = "ps_mp_personas_v1";
const PERSONA_PASSWORD = "persona2026";
const AUTH_STORAGE_KEY = "ps_persona_authed";
const STALE_DAYS = 30;

const STEPS = [
  "Searching Parliament records…",
  "Fetching Hansard contributions (pages 1–10)…",
  "Fetching Wikipedia biography…",
  "Checking press releases…",
  "Compiling source corpus…",
  "Analysing writing style with AI…",
  "Building system prompt…",
  "Finalising…",
];

const STEP_DELAYS = [2500, 7000, 13000, 18000, 22000, 28000, 95000, 160000];

function readPersonas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePersonas(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full — swallow
  }
}

function isStale(generatedAt) {
  if (!generatedAt) return false;
  return (Date.now() - new Date(generatedAt).getTime()) > STALE_DAYS * 86400 * 1000;
}

function formatDate(iso) {
  if (!iso) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value === PERSONA_PASSWORD) {
      try { sessionStorage.setItem(AUTH_STORAGE_KEY, "1"); } catch {}
      onUnlock();
    } else {
      setError("Incorrect password.");
      setValue("");
    }
  };

  return (
    <div className="page stack">
      <Helmet><title>MP Persona Generator | Political Solutions</title></Helmet>
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">AI Tools</span>
            <h1 className="portal-page-header__title">MP Persona Generator</h1>
            <p className="portal-page-header__subtitle">Enter your access password to continue.</p>
          </div>
        </div>
      </Card>
      <Card title="Access required">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}>
          <label className="field" htmlFor="persona-pw">
            <span>Password</span>
            <input
              id="persona-pw"
              className="input"
              type="password"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error && <p style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <Button type="submit">Unlock</Button>
        </form>
      </Card>
    </div>
  );
}

export default function MPPersona() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(AUTH_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [mpInput, setMpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [currentMp, setCurrentMp] = useState("");
  const [personas, setPersonas] = useState(readPersonas);
  const [copied, setCopied] = useState(false);
  const stepTimersRef = useRef([]);
  const outputRef = useRef(null);

  const stalePersonas = Object.values(personas).filter((p) => isStale(p.generatedAt));
  const staleCount = stalePersonas.length;

  useEffect(() => {
    if (!loading) return;
    setStepIndex(0);
    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = STEP_DELAYS.map((delay, i) =>
      setTimeout(() => setStepIndex((prev) => Math.max(prev, i + 1)), delay)
    );
    return () => {
      stepTimersRef.current.forEach(clearTimeout);
    };
  }, [loading]);

  const savePersona = useCallback((mpName, systemPrompt) => {
    setPersonas((prev) => {
      const next = {
        ...prev,
        [mpName]: { mpName, systemPrompt, generatedAt: new Date().toISOString() },
      };
      writePersonas(next);
      return next;
    });
  }, []);

  const deletePersona = useCallback((mpName) => {
    setPersonas((prev) => {
      const next = { ...prev };
      delete next[mpName];
      writePersonas(next);
      return next;
    });
    if (currentMp === mpName) {
      setOutput("");
      setCurrentMp("");
    }
  }, [currentMp]);

  const loadSavedPersona = useCallback((p) => {
    setOutput(p.systemPrompt);
    setCurrentMp(p.mpName);
    setMpInput(p.mpName);
    setError("");
    setStepIndex(0);
  }, []);

  const handleBuild = useCallback(async (nameOverride) => {
    const name = (nameOverride || mpInput).trim();
    if (!name) return;
    setLoading(true);
    setError("");
    setOutput("");
    setCurrentMp(name);
    try {
      const result = await buildPersona(name);
      savePersona(result.mpName || name, result.systemPrompt);
      setOutput(result.systemPrompt);
      setCurrentMp(result.mpName || name);
      setStepIndex(STEPS.length - 1);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      stepTimersRef.current.forEach(clearTimeout);
    }
  }, [mpInput, savePersona]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select textarea text
      outputRef.current?.select();
    }
  }, [output]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(currentMp || "mp-persona").replace(/\s+/g, "-").toLowerCase()}-persona.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [output, currentMp]);

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  const sortedPersonas = Object.values(personas).sort((a, b) =>
    new Date(b.generatedAt) - new Date(a.generatedAt)
  );

  return (
    <div className="page stack">
      <Helmet><title>MP Persona Generator | Political Solutions</title></Helmet>

      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">AI Tools</span>
            <h1 className="portal-page-header__title">MP Persona Generator</h1>
            <p className="portal-page-header__subtitle">
              Build a deployable AI writing persona from an MP's Hansard contributions,
              Wikipedia biography, and press releases.
            </p>
          </div>
        </div>
      </Card>

      {staleCount > 0 && (
        <div
          role="alert"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius)",
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--primary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚠</span>
          <span>
            <strong>{staleCount} persona{staleCount !== 1 ? "s" : ""}</strong> may be out of date (over 30 days old). Click a persona in the sidebar to review and refresh.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "var(--space-4)", alignItems: "start" }}>
        <Card title="Saved personas">
          {sortedPersonas.length === 0 && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              No personas saved yet.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sortedPersonas.map((p) => {
              const stale = isStale(p.generatedAt);
              const isActive = currentMp === p.mpName && output;
              return (
                <div
                  key={p.mpName}
                  style={{
                    border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 10px",
                    background: isActive ? "var(--accent-soft)" : "transparent",
                    fontSize: 13,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => loadSavedPersona(p)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      fontWeight: 600,
                      color: "var(--text)",
                      lineHeight: 1.3,
                    }}
                  >
                    {p.mpName}
                  </button>
                  <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 3 }}>
                    Last updated: {formatDate(p.generatedAt)}
                  </div>
                  {stale && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        background: "var(--accent-soft)",
                        color: "var(--primary)",
                        border: "1px solid var(--accent)",
                        borderRadius: 3,
                        padding: "1px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Refresh recommended
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button
                      type="button"
                      className="navLink"
                      style={{ fontSize: 11, padding: "2px 8px", flex: 1 }}
                      onClick={() => {
                        setMpInput(p.mpName);
                        handleBuild(p.mpName);
                      }}
                      disabled={loading}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="navLink"
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--danger)", borderColor: "var(--danger)" }}
                      onClick={() => deletePersona(p.mpName)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Card title="Generate persona">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="field" htmlFor="mp-name-input">
                <span>Enter MP name</span>
                <input
                  id="mp-name-input"
                  className="input"
                  type="text"
                  value={mpInput}
                  onChange={(e) => setMpInput(e.target.value)}
                  placeholder="e.g. Kemi Badenoch"
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && !loading && handleBuild()}
                />
              </label>
              <div>
                <Button
                  onClick={() => handleBuild()}
                  disabled={loading || !mpInput.trim()}
                  loading={loading}
                >
                  {loading ? "Building…" : "Build Persona"}
                </Button>
              </div>
            </div>

            {loading && (
              <div
                style={{
                  marginTop: 16,
                  padding: "10px 14px",
                  background: "var(--accent-soft)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--accent)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", marginBottom: 6 }}>
                  Step {Math.min(stepIndex + 1, STEPS.length)} of {STEPS.length}
                </div>
                <div style={{ fontSize: 13, color: "var(--accent)" }}>
                  {STEPS[Math.min(stepIndex, STEPS.length - 1)]}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    height: 4,
                    background: "var(--color-slate-light)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(((stepIndex + 1) / STEPS.length) * 100)}%`,
                      background: "var(--accent)",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                className="status error"
                role="alert"
                style={{ marginTop: 12, display: "block" }}
              >
                {error}
              </div>
            )}
          </Card>

          {output && (
            <Card
              title={`System prompt — ${currentMp}`}
              action={
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="button--small"
                    onClick={handleCopy}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="button--small"
                    onClick={handleDownload}
                  >
                    Download .txt
                  </Button>
                </div>
              }
            >
              <textarea
                ref={outputRef}
                readOnly
                value={output}
                style={{
                  width: "100%",
                  minHeight: 420,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  lineHeight: 1.6,
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-muted)",
                  color: "var(--text)",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
                aria-label="Generated system prompt"
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
