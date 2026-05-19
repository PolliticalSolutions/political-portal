import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { getSession } from "../../auth/session.js";
import {
  buildPersona,
  generateDraft,
  getPermittedMpForUser,
  getPersonaForUser,
  listDrafts,
  saveDraft,
} from "../../lib/personaApi.js";

const STEPS = [
  "Searching Parliament records…",
  "Fetching Hansard contributions (pages 1–10)…",
  "Researching public records…",
  "Checking press releases…",
  "Compiling source corpus…",
  "Analysing writing style with AI…",
  "Building system prompt…",
  "Finalising…",
];

const STEP_DELAYS = [2500, 7000, 13000, 18000, 22000, 28000, 95000, 160000];

const OUTPUT_TYPES = [
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
  { value: "social_post", label: "Social Media Post" },
  { value: "speech_notes", label: "Speech Notes" },
  { value: "press_release", label: "Press Release" },
];

const OUTPUT_TYPE_LABELS = Object.fromEntries(OUTPUT_TYPES.map((entry) => [entry.value, entry.label]));
const CONTEXT_MAX = 1000;
const ACTIVITY_PING_INTERVAL_MS = 60000;
const ACCESS_DENIED_MESSAGE = "MP Persona access not enabled for this account.";

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value, max) {
  const text = (value || "").toString();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function pingActivity() {
  try {
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  } catch {
    // Silently ignore — synthetic event creation failures are non-critical.
  }
}

function StepIndicator({ stepIndex }) {
  return (
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
  );
}

function CopyButton({ text, label = "Copy to clipboard" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write may fail in unsupported environments; the textarea
      // remains selectable as a fallback.
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      className="button--small"
      onClick={handleCopy}
    >
      {copied ? "Copied!" : label}
    </Button>
  );
}

function AccessDeniedView() {
  return (
    <Card title="Parliamentary Communications Service">
      <div
        role="alert"
        style={{
          padding: "14px 16px",
          background: "var(--surface-muted, #f8f9fb)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <p style={{ marginTop: 0, fontWeight: 600 }}>
          Parliamentary Communications Service access is not enabled on your account.
        </p>
        <p style={{ marginBottom: 0 }}>
          Contact Political Solutions to subscribe:{" "}
          <a href="mailto:hello@politicalsolutions.uk">hello@politicalsolutions.uk</a>.
        </p>
      </div>
    </Card>
  );
}

function NoMpView() {
  return (
    <Card title="No MP linked">
      <div
        role="alert"
        style={{
          padding: "14px 16px",
          background: "var(--surface-muted, #f8f9fb)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--warning, #c98a2b)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <p style={{ margin: 0 }}>
          No MP is linked to your permitted constituency. Contact support at{" "}
          <a href="mailto:hello@politicalsolutions.uk">hello@politicalsolutions.uk</a>.
        </p>
      </div>
    </Card>
  );
}

function StyleGuideTab({
  loading,
  stepIndex,
  error,
  resolution,
  persona,
  onGenerate,
  onRegenerate,
}) {
  const { mpName, constituencyName } = resolution || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Card title="MP Style Guide">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
          <label className="field" htmlFor="persona-mp-name">
            <span>Member of Parliament</span>
            <input
              id="persona-mp-name"
              className="input"
              type="text"
              value={mpName || ""}
              readOnly
              aria-readonly="true"
              style={{ background: "var(--surface-muted, #f8f9fb)" }}
            />
            {constituencyName && (
              <span className="muted" style={{ fontSize: 12 }}>
                Constituency: {constituencyName}
              </span>
            )}
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!persona && (
              <Button
                onClick={onGenerate}
                disabled={loading || !mpName}
                loading={loading}
              >
                {loading ? "Generating…" : "Generate Style Guide"}
              </Button>
            )}
            {persona && (
              <Button
                variant="ghost"
                onClick={onRegenerate}
                disabled={loading || !mpName}
                loading={loading}
              >
                {loading ? "Regenerating…" : "Regenerate"}
              </Button>
            )}
          </div>
        </div>

        {loading && <StepIndicator stepIndex={stepIndex} />}

        {error && (
          <div className="status error" role="alert" style={{ marginTop: 12, display: "block" }}>
            {error}
          </div>
        )}
      </Card>

      {persona && !loading && (
        <Card
          title={`System prompt — ${persona.mp_name}`}
          action={<CopyButton text={persona.system_prompt} />}
        >
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Last updated: {formatDate(persona.updated_at)}
          </div>
          <textarea
            readOnly
            value={persona.system_prompt}
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
  );
}

function DraftTab({
  persona,
  drafts,
  generating,
  stepIndex,
  error,
  output,
  context,
  outputType,
  onContextChange,
  onOutputTypeChange,
  onGenerate,
  onSave,
  saved,
}) {
  const [expandedId, setExpandedId] = useState("");
  const contextRemaining = CONTEXT_MAX - context.length;
  const canSubmit = !generating && context.trim().length > 0;

  if (!persona) {
    return (
      <Card title="Draft Communications">
        <p className="muted" style={{ margin: 0 }}>
          Generate your MP Style Guide first to enable draft communications.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Card title="Draft Communications">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
          <label className="field" htmlFor="draft-output-type">
            <span>Output type</span>
            <select
              id="draft-output-type"
              className="input"
              value={outputType}
              onChange={(event) => onOutputTypeChange(event.target.value)}
              disabled={generating}
            >
              {OUTPUT_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" htmlFor="draft-context">
            <span>Context</span>
            <textarea
              id="draft-context"
              className="input"
              value={context}
              onChange={(event) => {
                const next = event.target.value;
                onContextChange(next.length > CONTEXT_MAX ? next.slice(0, CONTEXT_MAX) : next);
              }}
              rows={6}
              maxLength={CONTEXT_MAX}
              placeholder="What is this draft about? Include the topic, the audience, any local hooks, and the key points the MP wants to make."
              disabled={generating}
            />
            <span
              className="muted"
              style={{ fontSize: 12, textAlign: "right" }}
              aria-live="polite"
            >
              {context.length} / {CONTEXT_MAX} characters
              {contextRemaining < 100 && contextRemaining >= 0 ? " — approaching limit" : ""}
            </span>
          </label>

          <div>
            <Button
              onClick={onGenerate}
              disabled={!canSubmit}
              loading={generating}
            >
              {generating ? "Drafting…" : "Generate Draft"}
            </Button>
          </div>
        </div>

        {generating && <StepIndicator stepIndex={stepIndex} />}

        {error && (
          <div className="status error" role="alert" style={{ marginTop: 12, display: "block" }}>
            {error}
          </div>
        )}
      </Card>

      {output && !generating && (
        <Card
          title="Generated draft"
          action={
            <div style={{ display: "flex", gap: 8 }}>
              <CopyButton text={output} />
              <Button
                type="button"
                variant="primary"
                className="button--small"
                onClick={onSave}
                disabled={saved}
              >
                {saved ? "Saved" : "Save Draft"}
              </Button>
            </div>
          }
        >
          <textarea
            readOnly
            value={output}
            style={{
              width: "100%",
              minHeight: 300,
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              lineHeight: 1.6,
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-muted)",
              color: "var(--text)",
              resize: "vertical",
              boxSizing: "border-box",
            }}
            aria-label="Generated draft"
          />
        </Card>
      )}

      <Card title="Saved drafts">
        {drafts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No saved drafts yet. Generate a draft and save it to keep a copy.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Output type</th>
                  <th>Context</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((row) => {
                  const isExpanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                          {formatDate(row.created_at)}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {OUTPUT_TYPE_LABELS[row.output_type] || row.output_type}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {truncate(row.context_provided, 80)}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            className="button--small"
                            onClick={() => setExpandedId(isExpanded ? "" : row.id)}
                          >
                            {isExpanded ? "Hide" : "View"}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={4} style={{ background: "var(--surface-muted)" }}>
                            <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                              <div>
                                <strong style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                  Context provided
                                </strong>
                                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}>
                                  {row.context_provided}
                                </p>
                              </div>
                              <div>
                                <strong style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                  Generated draft
                                </strong>
                                <pre
                                  style={{
                                    margin: "4px 0 0",
                                    whiteSpace: "pre-wrap",
                                    fontFamily: "inherit",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {row.generated_text}
                                </pre>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <CopyButton text={row.generated_text} label="Copy draft" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function MPPersona() {
  const cognitoSub = useMemo(() => getSession()?.user?.sub || "", []);

  const [activeTab, setActiveTab] = useState("style");
  const [resolution, setResolution] = useState(null);
  const [resolutionLoading, setResolutionLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [resolutionError, setResolutionError] = useState("");

  const [persona, setPersona] = useState(null);
  const [drafts, setDrafts] = useState([]);

  const [styleLoading, setStyleLoading] = useState(false);
  const [styleStep, setStyleStep] = useState(0);
  const [styleError, setStyleError] = useState("");

  const [draftOutputType, setDraftOutputType] = useState("email");
  const [draftContext, setDraftContext] = useState("");
  const [draftOutput, setDraftOutput] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftStep, setDraftStep] = useState(0);
  const [draftSaved, setDraftSaved] = useState(false);

  const styleTimersRef = useRef([]);
  const draftTimersRef = useRef([]);
  const activityIntervalRef = useRef(null);

  const startStepTimers = useCallback((kind) => {
    const setter = kind === "draft" ? setDraftStep : setStyleStep;
    const ref = kind === "draft" ? draftTimersRef : styleTimersRef;
    setter(0);
    ref.current.forEach(clearTimeout);
    ref.current = STEP_DELAYS.map((delay, index) =>
      window.setTimeout(() => setter((prev) => Math.max(prev, index + 1)), delay)
    );
  }, []);

  const stopStepTimers = useCallback((kind) => {
    const ref = kind === "draft" ? draftTimersRef : styleTimersRef;
    ref.current.forEach(clearTimeout);
    ref.current = [];
  }, []);

  const startActivityPing = useCallback(() => {
    if (activityIntervalRef.current) return;
    activityIntervalRef.current = window.setInterval(pingActivity, ACTIVITY_PING_INTERVAL_MS);
  }, []);

  const stopActivityPing = useCallback(() => {
    if (activityIntervalRef.current) {
      clearInterval(activityIntervalRef.current);
      activityIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    styleTimersRef.current.forEach(clearTimeout);
    draftTimersRef.current.forEach(clearTimeout);
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!cognitoSub) {
      setResolutionLoading(false);
      setAccessDenied(true);
      return undefined;
    }

    async function load() {
      setResolutionLoading(true);
      setResolutionError("");
      setAccessDenied(false);
      try {
        const permitted = await getPermittedMpForUser(cognitoSub);
        if (cancelled) return;
        setResolution(permitted);
        if (permitted?.onsCode) {
          const existing = await getPersonaForUser(cognitoSub, permitted.onsCode);
          if (cancelled) return;
          setPersona(existing);
        }
        const list = await listDrafts(cognitoSub);
        if (cancelled) return;
        setDrafts(list);
      } catch (err) {
        if (cancelled) return;
        const message = err?.message || "Failed to load persona.";
        if (message === ACCESS_DENIED_MESSAGE) {
          setAccessDenied(true);
        } else {
          setResolutionError(message);
        }
      } finally {
        if (!cancelled) setResolutionLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cognitoSub]);

  const handleGenerate = useCallback(async () => {
    if (!resolution?.mpName || !resolution?.onsCode) return;
    setStyleLoading(true);
    setStyleError("");
    startStepTimers("style");
    startActivityPing();
    try {
      const result = await buildPersona(resolution.mpName, resolution.onsCode, cognitoSub);
      const next = await getPersonaForUser(cognitoSub, resolution.onsCode);
      setPersona(
        next || {
          id: result.personaId,
          mp_name: result.mpName,
          constituency_ons_code: resolution.onsCode,
          system_prompt: result.systemPrompt,
          updated_at: new Date().toISOString(),
        }
      );
      setStyleStep(STEPS.length - 1);
    } catch (err) {
      const message = err?.message || "Something went wrong.";
      if (message === ACCESS_DENIED_MESSAGE) {
        setAccessDenied(true);
      } else {
        setStyleError(message);
      }
    } finally {
      setStyleLoading(false);
      stopStepTimers("style");
      stopActivityPing();
    }
  }, [resolution, cognitoSub, startStepTimers, stopStepTimers, startActivityPing, stopActivityPing]);

  const handleGenerateDraft = useCallback(async () => {
    if (!persona) return;
    setDraftLoading(true);
    setDraftError("");
    setDraftOutput("");
    setDraftSaved(false);
    startStepTimers("draft");
    startActivityPing();
    try {
      const result = await generateDraft({
        systemPrompt: persona.system_prompt,
        outputType: draftOutputType,
        context: draftContext,
      });
      setDraftOutput(result.generatedText);
      setDraftStep(STEPS.length - 1);
    } catch (err) {
      setDraftError(err?.message || "Failed to generate draft.");
    } finally {
      setDraftLoading(false);
      stopStepTimers("draft");
      stopActivityPing();
    }
  }, [persona, draftContext, draftOutputType, startStepTimers, stopStepTimers, startActivityPing, stopActivityPing]);

  const handleSaveDraft = useCallback(async () => {
    if (!persona || !draftOutput) return;
    try {
      const saved = await saveDraft({
        personaId: persona.id,
        cognitoSub,
        outputType: draftOutputType,
        context: draftContext,
        generatedText: draftOutput,
      });
      setDrafts((prev) => [saved, ...prev]);
      setDraftSaved(true);
    } catch (err) {
      setDraftError(err?.message || "Failed to save draft.");
    }
  }, [persona, draftOutput, cognitoSub, draftOutputType, draftContext]);

  const tabsDisabled = !persona;

  if (resolutionLoading) {
    return (
      <div className="page stack">
        <Helmet>
          <title>Parliamentary Communications | Political Solutions</title>
        </Helmet>
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Parliamentary Services</span>
              <h1 className="portal-page-header__title">Parliamentary Communications</h1>
              <p className="portal-page-header__subtitle">Loading…</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Helmet>
        <title>Parliamentary Communications | Political Solutions</title>
      </Helmet>

      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Parliamentary Services</span>
            <h1 className="portal-page-header__title">Parliamentary Communications</h1>
            <p className="portal-page-header__subtitle">
              Build an MP writing persona from Hansard and public records, then draft
              campaign communications in the MP's authentic voice.
            </p>
          </div>
        </div>
      </Card>

      {accessDenied ? (
        <AccessDeniedView />
      ) : resolutionError ? (
        <Card title="Could not load persona">
          <div className="status error" role="alert" style={{ display: "block" }}>
            {resolutionError}
          </div>
        </Card>
      ) : !resolution?.mpName ? (
        <NoMpView />
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant={activeTab === "style" ? "primary" : "ghost"}
                onClick={() => setActiveTab("style")}
              >
                MP Style Guide
              </Button>
              <span title={tabsDisabled ? "Generate your MP Style Guide first" : ""}>
                <Button
                  variant={activeTab === "draft" ? "primary" : "ghost"}
                  onClick={() => setActiveTab("draft")}
                  disabled={tabsDisabled}
                >
                  Draft Communications
                </Button>
              </span>
            </div>
          </Card>

          {activeTab === "style" && (
            <StyleGuideTab
              loading={styleLoading}
              stepIndex={styleStep}
              error={styleError}
              resolution={resolution}
              persona={persona}
              onGenerate={handleGenerate}
              onRegenerate={handleGenerate}
            />
          )}

          {activeTab === "draft" && (
            <DraftTab
              persona={persona}
              drafts={drafts}
              generating={draftLoading}
              stepIndex={draftStep}
              error={draftError}
              output={draftOutput}
              context={draftContext}
              outputType={draftOutputType}
              onContextChange={setDraftContext}
              onOutputTypeChange={setDraftOutputType}
              onGenerate={handleGenerateDraft}
              onSave={handleSaveDraft}
              saved={draftSaved}
            />
          )}
        </>
      )}
    </div>
  );
}
