import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { listManagedElections, saveManagedElection, archiveManagedElection, searchElectionConstituencies } from "../../../lib/adminElectionsApi.js";
import { getAdminMe, runAdminElectionSync } from "../../../lib/uploadApi.js";

const ELECTION_TYPES = [
  { value: "GENERAL", label: "General" },
  { value: "LOCAL", label: "Local" },
  { value: "BY_ELECTION", label: "By-Election" },
  { value: "NOTIONAL", label: "Notional" },
];

const ELECTION_STATUSES = ["UPCOMING", "OPEN", "CLOSED", "ARCHIVED"];

function emptyForm() {
  return {
    electionId: "",
    name: "",
    date: "",
    electionType: "LOCAL",
    status: "UPCOMING",
    localAuthorityName: "",
    wardName: "",
    isByElection: false,
    democracyClubId: "",
    linkedConstituencies: [],
  };
}

function toForm(election) {
  return {
    electionId: election.electionId || "",
    name: election.name || "",
    date: election.date || election.polling_date || election.election_date || "",
    electionType: (election.electionType || election.election_type || "LOCAL").toString().trim().toUpperCase(),
    status: (election.status || "UPCOMING").toString().trim().toUpperCase(),
    localAuthorityName: election.localAuthorityName || "",
    wardName: election.wardName || "",
    isByElection: election.isByElection === true,
    democracyClubId: election.democracyClubId || "",
    linkedConstituencies: (election.constituencyLinks || []).map((entry) => ({
      id: entry.constituencyId,
      name: entry.name,
      onsCode: entry.onsCode,
    })),
  };
}

function flashLater(setBanner, type, msg) {
  setBanner({ type, msg });
  window.clearTimeout(flashLater.timer);
  flashLater.timer = window.setTimeout(() => setBanner({ type: "", msg: "" }), 4500);
}

function formatElectionLabel(election) {
  const dateValue = election.polling_date || election.date || election.election_date || "";
  const monthYear = dateValue
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${dateValue}T00:00:00`))
    : "";
  const rawType = (election.electionType || election.election_type || "").toString().trim().toUpperCase();

  if (rawType === "GENERAL") {
    return `${dateValue.slice(0, 4)} General Election`;
  }
  if (election.isByElection || rawType === "BY_ELECTION") {
    const title = /by-election/i.test(election.name || "") ? election.name : `${election.name || "Election"} By-Election`;
    return monthYear ? `${title} — ${monthYear}` : title;
  }
  if (rawType === "LOCAL") {
    const authorityName = (election.localAuthorityName || election.name || "Local").replace(/\s+elections?$/i, "").trim();
    const title = /elections?$/i.test(authorityName) ? authorityName : `${authorityName} Elections`;
    return monthYear ? `${title} — ${monthYear}` : title;
  }
  return election.name || "Election";
}

export default function ElectionsPage() {
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [banner, setBanner] = useState({ type: "", msg: "" });
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getAdminMe()
      .then((result) => setIsAdmin(Boolean(result?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAdminChecked(true));
  }, []);

  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
    refresh();
  }, [adminChecked, isAdmin]);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchElectionConstituencies(searchQuery.trim());
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await listManagedElections();
      setElections(rows);
      if (selectedElectionId) {
        const selected = rows.find((row) => row.electionId === selectedElectionId);
        if (selected) {
          setForm(toForm(selected));
        } else {
          setSelectedElectionId("");
          setForm(emptyForm());
        }
      }
      return rows;
    } catch (error) {
      flashLater(setBanner, "error", error.message || "Failed to load elections.");
      return [];
    } finally {
      setLoading(false);
    }
  }

  function selectElection(election) {
    setSelectedElectionId(election.electionId);
    setForm(toForm(election));
    setSearchQuery("");
    setSearchResults([]);
  }

  function resetForm() {
    setSelectedElectionId("");
    setForm(emptyForm());
    setSearchQuery("");
    setSearchResults([]);
  }

  function addConstituency(result) {
    setForm((current) => {
      if (current.linkedConstituencies.some((entry) => entry.id === result.id)) {
        return current;
      }
      return {
        ...current,
        linkedConstituencies: [
          ...current.linkedConstituencies,
          { id: result.id, name: result.name, onsCode: result.ons_code },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeConstituency(constituencyId) {
    setForm((current) => ({
      ...current,
      linkedConstituencies: current.linkedConstituencies.filter((entry) => entry.id !== constituencyId),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const electionId = await saveManagedElection({
        electionId: form.electionId,
        name: form.name,
        date: form.date,
        electionType: form.electionType,
        status: form.status,
        localAuthorityName: form.localAuthorityName,
        wardName: form.wardName,
        isByElection: form.isByElection,
        democracyClubId: form.democracyClubId,
        pconCodes: form.linkedConstituencies.map((entry) => entry.onsCode),
      });
      const rows = await refresh();
      const saved = rows.find((row) => row.electionId === electionId);
      if (saved) {
        selectElection(saved);
      } else {
        setSelectedElectionId(electionId);
      }
      flashLater(setBanner, "success", "Election saved.");
    } catch (error) {
      flashLater(setBanner, "error", error.message || "Failed to save election.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!form.electionId) return;
    setArchiving(true);
    try {
      await archiveManagedElection(form.electionId);
      await refresh();
      flashLater(setBanner, "success", "Election archived.");
    } catch (error) {
      flashLater(setBanner, "error", error.message || "Failed to archive election.");
    } finally {
      setArchiving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await runAdminElectionSync();
      await refresh();
      flashLater(
        setBanner,
        "success",
        `Sync complete: ${result.matchedCount} matched, ${result.unmatchedCount} unmatched.`
      );
    } catch (error) {
      flashLater(setBanner, "error", error.message || "Failed to run Democracy Club sync.");
    } finally {
      setSyncing(false);
    }
  }

  if (!adminChecked) {
    return (
      <div className="page stack">
        <p className="muted">Verifying access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Admin</span>
            <h1 className="portal-page-header__title">Elections</h1>
            <p className="portal-page-header__subtitle">
              Manage upload elections, constituency links, and Democracy Club syncs.
            </p>
          </div>
        </div>
      </Card>

      {banner.msg && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            background: banner.type === "error" ? "#fee2e2" : "#dcfce7",
            color: banner.type === "error" ? "#b91c1c" : "#15803d",
            fontWeight: 600,
          }}
        >
          {banner.msg}
        </div>
      )}

      <Card
        title="Election records"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
            <Button variant="ghost" onClick={handleSync} loading={syncing} disabled={syncing}>
              Trigger Democracy Club sync
            </Button>
            <Button onClick={resetForm}>New election</Button>
          </div>
        }
      >
        {loading ? (
          <p className="muted">Loading elections…</p>
        ) : elections.length === 0 ? (
          <p className="muted">No elections found.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Election</th>
                  <th>Status</th>
                  <th>Linked constituencies</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {elections.map((election) => (
                  <tr key={election.electionId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{formatElectionLabel(election)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{election.electionId}</div>
                    </td>
                    <td>{election.status || "—"}</td>
                    <td>{election.pconCodes?.length || 0}</td>
                    <td>{election.lastSyncedAt ? new Date(election.lastSyncedAt).toLocaleString("en-GB") : "—"}</td>
                    <td>
                      <Button variant="ghost" className="button--small" onClick={() => selectElection(election)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={form.electionId ? "Manage selected election" : "Create election"}>
        <div className="stack" style={{ gap: 12, maxWidth: 860 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label className="field">
              <span>Name</span>
              <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Date</span>
              <input className="input" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </label>
            <label className="field">
              <span>Type</span>
              <select className="input" value={form.electionType} onChange={(event) => setForm((current) => ({ ...current, electionType: event.target.value }))}>
                {ELECTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                {ELECTION_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label className="field">
              <span>Local authority name</span>
              <input className="input" value={form.localAuthorityName} onChange={(event) => setForm((current) => ({ ...current, localAuthorityName: event.target.value }))} />
            </label>
            <label className="field">
              <span>Ward or division name</span>
              <input className="input" value={form.wardName} onChange={(event) => setForm((current) => ({ ...current, wardName: event.target.value }))} />
            </label>
            <label className="field">
              <span>Democracy Club ID</span>
              <input className="input" value={form.democracyClubId} onChange={(event) => setForm((current) => ({ ...current, democracyClubId: event.target.value }))} />
            </label>
            <label className="field">
              <span>By-election</span>
              <select className="input" value={form.isByElection ? "true" : "false"} onChange={(event) => setForm((current) => ({ ...current, isByElection: event.target.value === "true" }))}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
          </div>

          <div className="field">
            <label htmlFor="electionConSearch">Link constituencies</label>
            <input
              id="electionConSearch"
              className="input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by constituency name or ONS code"
            />
            {searching && <p className="muted" style={{ marginTop: 6 }}>Searching…</p>}
            {searchResults.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <tbody>
                    {searchResults.map((result) => (
                      <tr key={result.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{result.name}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{result.ons_code}</div>
                        </td>
                        <td style={{ width: 1 }}>
                          <Button variant="ghost" className="button--small" onClick={() => addConstituency(result)}>
                            Link
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Linked constituency</th>
                  <th>ONS code</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {form.linkedConstituencies.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">No constituencies linked yet.</td>
                  </tr>
                ) : (
                  form.linkedConstituencies.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.name}</td>
                      <td>{entry.onsCode}</td>
                      <td>
                        <Button variant="ghost" className="button--small" onClick={() => removeConstituency(entry.id)}>
                          Unlink
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              {form.electionId ? "Save election" : "Create election"}
            </Button>
            <Button variant="ghost" onClick={resetForm}>
              Clear
            </Button>
            {form.electionId && (
              <Button variant="ghost" onClick={handleArchive} loading={archiving} disabled={archiving}>
                Archive
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
