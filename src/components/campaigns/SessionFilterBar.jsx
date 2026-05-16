// Three multi-select filters over the sessions list:
//   - Constituency (all constituencies in the user's accessible regions)
//   - Activity / session type (the existing SESSION_TYPE_ORDER)
//   - Campaign context (the new CAMPAIGN_CONTEXT_ORDER)
//
// State lives in URL search params so filters survive refresh and can
// be linked. The parent (CampaignSessionsPage) reads the params and
// applies them to the sessions array before passing to map / list / calendar.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SESSION_TYPE_LABELS,
  SESSION_TYPE_ORDER,
  CAMPAIGN_CONTEXT_LABELS,
  CAMPAIGN_CONTEXT_ORDER,
} from "../../lib/campaignConfig.js";
import { supabase } from "../../lib/supabaseClient.js";

const PARAM_KEYS = {
  constituency: "constituency",
  type: "type",
  context: "context",
};

export function readFiltersFromParams(searchParams) {
  return {
    constituency: parseCsvParam(searchParams.get(PARAM_KEYS.constituency)),
    type:         parseCsvParam(searchParams.get(PARAM_KEYS.type)),
    context:      parseCsvParam(searchParams.get(PARAM_KEYS.context)),
  };
}

function parseCsvParam(value) {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

export default function SessionFilterBar({ regions }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFiltersFromParams(searchParams), [searchParams]);

  const [constituencies, setConstituencies] = useState([]);

  // Load constituencies in the user's accessible regions for the filter
  // dropdown. Admins (regions undefined / empty) get the full 650.
  useEffect(() => {
    let cancelled = false;
    let query = supabase
      .from("constituencies")
      .select("id, name, ons_code, region")
      .order("name");
    if (Array.isArray(regions) && regions.length > 0) {
      query = query.in("region", regions);
    }
    query.then(({ data, error }) => {
      if (cancelled || error) return;
      setConstituencies(data || []);
    });
    return () => { cancelled = true; };
  }, [regions ? regions.join("|") : ""]);

  const update = (key, values) => {
    const next = new URLSearchParams(searchParams);
    if (values.length === 0) next.delete(PARAM_KEYS[key]);
    else next.set(PARAM_KEYS[key], values.join(","));
    setSearchParams(next, { replace: true });
  };

  const clearAll = () => {
    const next = new URLSearchParams(searchParams);
    for (const k of Object.values(PARAM_KEYS)) next.delete(k);
    setSearchParams(next, { replace: true });
  };

  const totalSelected = filters.constituency.length + filters.type.length + filters.context.length;

  return (
    <div className="campaigns-filter-bar">
      <FilterDropdown
        label="Constituency"
        selected={filters.constituency}
        options={constituencies.map((c) => ({ value: c.ons_code, label: c.name }))}
        onChange={(values) => update("constituency", values)}
        emptyHint="No constituencies loaded yet"
      />
      <FilterDropdown
        label="Activity"
        selected={filters.type}
        options={SESSION_TYPE_ORDER.map((t) => ({ value: t, label: SESSION_TYPE_LABELS[t] }))}
        onChange={(values) => update("type", values)}
      />
      <FilterDropdown
        label="Campaign context"
        selected={filters.context}
        options={CAMPAIGN_CONTEXT_ORDER.map((c) => ({ value: c, label: CAMPAIGN_CONTEXT_LABELS[c] }))}
        onChange={(values) => update("context", values)}
      />
      {totalSelected > 0 && (
        <button type="button" className="campaigns-filter-clear" onClick={clearAll}>
          Clear ({totalSelected})
        </button>
      )}
    </div>
  );
}

function FilterDropdown({ label, options, selected, onChange, emptyHint }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = (value) => {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value); else set.add(value);
    onChange(Array.from(set));
  };

  const summary = selected.length === 0
    ? "Any"
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label || selected[0])
      : `${selected.length} selected`;

  return (
    <div className="campaigns-filter" ref={wrapRef}>
      <button
        type="button"
        className={`campaigns-filter__trigger${selected.length > 0 ? " is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="campaigns-filter__label">{label}</span>
        <span className="campaigns-filter__summary">{summary}</span>
        <span className="campaigns-filter__caret">▾</span>
      </button>
      {open && (
        <div className="campaigns-filter__panel">
          {options.length === 0 && emptyHint && (
            <div style={{ padding: "var(--space-3)", color: "var(--portal-text-muted)", fontSize: "var(--text-sm)" }}>
              {emptyHint}
            </div>
          )}
          {options.length > 0 && (
            <>
              <div className="campaigns-filter__panel-header">
                <span style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>{options.length} options</span>
                {selected.length > 0 && (
                  <button type="button" className="campaigns-filter__clear" onClick={() => onChange([])}>
                    Clear
                  </button>
                )}
              </div>
              <ul className="campaigns-filter__options">
                {options.map((opt) => {
                  const checked = selected.includes(opt.value);
                  return (
                    <li key={opt.value}>
                      <label>
                        <input type="checkbox" checked={checked} onChange={() => toggle(opt.value)} />
                        <span>{opt.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
