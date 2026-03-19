import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { getAdminMe } from "../../../lib/uploadApi.js";
import {
  createAssociation,
  getAssociationConstituencies,
  linkConstituency,
  listAssociations,
  unlinkConstituency,
  updateAssociation,
} from "../../../lib/permissionsApi.js";
import { getSupabaseServiceClient } from "../../../lib/supabaseServiceClient.js";

export default function AssociationsPage() {
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [associations, setAssociations] = useState([]);
  const [loadingAssocs, setLoadingAssocs] = useState(true);

  const [editingId, setEditingId] = useState(null); // null = not editing
  const [editForm, setEditForm] = useState({ name: "", region: "", country: "England", notes: "" });
  const [saving, setSaving] = useState(false);

  const [creatingNew, setCreatingNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", region: "", country: "England", notes: "" });
  const [creating, setCreating] = useState(false);

  // Constituency linking
  const [expandedAssocId, setExpandedAssocId] = useState(null);
  const [assocConstituencies, setAssocConstituencies] = useState({}); // assocId -> [{linkId, id, name, ons_code}]
  const [loadingCons, setLoadingCons] = useState(false);
  const [conSearch, setConSearch] = useState("");
  const [conSearchResults, setConSearchResults] = useState([]);
  const [conSearching, setConSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState("");

  const [banner, setBanner] = useState({ type: "", msg: "" });

  // Admin gate
  useEffect(() => {
    getAdminMe()
      .then((r) => setIsAdmin(Boolean(r?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAdminChecked(true));
  }, []);

  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
    loadAssociations();
  }, [adminChecked, isAdmin]);

  async function loadAssociations() {
    setLoadingAssocs(true);
    try {
      const data = await listAssociations();
      setAssociations(data);
    } catch {
      // ignore
    } finally {
      setLoadingAssocs(false);
    }
  }

  function flashBanner(type, msg) {
    setBanner({ type, msg });
    setTimeout(() => setBanner({ type: "", msg: "" }), 4000);
  }

  // ── Edit existing association ───────────────────────────────────────────────

  function startEdit(assoc) {
    setEditingId(assoc.id);
    setEditForm({ name: assoc.name, region: assoc.region || "", country: assoc.country || "England", notes: assoc.notes || "" });
    setCreatingNew(false);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit() {
    if (!editForm.name.trim()) {
      flashBanner("error", "Name is required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAssociation(editingId, {
        name: editForm.name.trim(),
        region: editForm.region.trim() || null,
        country: editForm.country.trim() || "England",
        notes: editForm.notes.trim() || null,
      });
      setAssociations((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...updated } : a)));
      setEditingId(null);
      flashBanner("success", "Association updated.");
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Create new association ─────────────────────────────────────────────────

  function startCreate() {
    setCreatingNew(true);
    setNewForm({ name: "", region: "", country: "England", notes: "" });
    setEditingId(null);
  }

  function cancelCreate() {
    setCreatingNew(false);
  }

  async function handleCreate() {
    if (!newForm.name.trim()) {
      flashBanner("error", "Name is required.");
      return;
    }
    setCreating(true);
    try {
      const created = await createAssociation({
        name: newForm.name.trim(),
        region: newForm.region.trim() || null,
        country: newForm.country.trim() || "England",
        notes: newForm.notes.trim() || null,
      });
      setAssociations((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreatingNew(false);
      flashBanner("success", "Association created.");
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Constituency linking ───────────────────────────────────────────────────

  async function toggleExpanded(assocId) {
    if (expandedAssocId === assocId) {
      setExpandedAssocId(null);
      setConSearch("");
      setConSearchResults([]);
      return;
    }
    setExpandedAssocId(assocId);
    setConSearch("");
    setConSearchResults([]);
    if (!assocConstituencies[assocId]) {
      await reloadAssocConstituencies(assocId);
    }
  }

  async function reloadAssocConstituencies(assocId) {
    setLoadingCons(true);
    try {
      const cons = await getAssociationConstituencies(assocId);
      setAssocConstituencies((prev) => ({ ...prev, [assocId]: cons }));
    } catch {
      // ignore
    } finally {
      setLoadingCons(false);
    }
  }

  useEffect(() => {
    if (!conSearch.trim() || conSearch.trim().length < 2) {
      setConSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setConSearching(true);
      try {
        const db = getSupabaseServiceClient();
        if (!db) return;
        const { data } = await db
          .from("constituencies")
          .select("id, name, ons_code")
          .ilike("name", `%${conSearch.trim()}%`)
          .order("name")
          .limit(10);
        setConSearchResults(data || []);
      } catch {
        setConSearchResults([]);
      } finally {
        setConSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [conSearch]);

  async function handleLink(assocId, constituencyId) {
    setLinking(true);
    try {
      await linkConstituency(assocId, constituencyId);
      await reloadAssocConstituencies(assocId);
      setConSearch("");
      setConSearchResults([]);
      flashBanner("success", "Constituency linked.");
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(assocId, linkId) {
    setUnlinking(linkId);
    try {
      await unlinkConstituency(linkId);
      await reloadAssocConstituencies(assocId);
      flashBanner("success", "Constituency unlinked.");
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setUnlinking("");
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
            <h1 className="portal-page-header__title">Associations</h1>
            <p className="portal-page-header__subtitle">
              Manage associations and the constituencies they cover.
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
            fontSize: 14,
          }}
        >
          {banner.msg}
        </div>
      )}

      {/* Create new */}
      <Card title="Associations">
        <div style={{ marginBottom: 12 }}>
          {!creatingNew && (
            <Button onClick={startCreate}>Add association</Button>
          )}
        </div>

        {creatingNew && (
          <div className="stack" style={{ gap: 10, maxWidth: 480, marginBottom: 20, padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
            <p style={{ fontWeight: 600, margin: 0 }}>New association</p>
            <label className="field">
              <span>Name *</span>
              <input
                className="input"
                type="text"
                value={newForm.name}
                onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Newcastle Under Lyme Conservative Association"
              />
            </label>
            <label className="field">
              <span>Region</span>
              <input
                className="input"
                type="text"
                value={newForm.region}
                onChange={(e) => setNewForm((p) => ({ ...p, region: e.target.value }))}
                placeholder="e.g. West Midlands"
              />
            </label>
            <label className="field">
              <span>Country</span>
              <input
                className="input"
                type="text"
                value={newForm.country}
                onChange={(e) => setNewForm((p) => ({ ...p, country: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                className="input"
                rows={2}
                value={newForm.notes}
                onChange={(e) => setNewForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={handleCreate} loading={creating} disabled={creating}>
                Create
              </Button>
              <Button variant="ghost" onClick={cancelCreate} disabled={creating}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loadingAssocs ? (
          <p className="muted">Loading associations…</p>
        ) : associations.length === 0 ? (
          <p className="muted">No associations found.</p>
        ) : (
          <div className="stack" style={{ gap: 16 }}>
            {associations.map((assoc) => {
              const isEditing = editingId === assoc.id;
              const isExpanded = expandedAssocId === assoc.id;
              const cons = assocConstituencies[assoc.id] || [];

              return (
                <div
                  key={assoc.id}
                  style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 16 }}
                >
                  {isEditing ? (
                    <div className="stack" style={{ gap: 10, maxWidth: 480 }}>
                      <label className="field">
                        <span>Name *</span>
                        <input
                          className="input"
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Region</span>
                        <input
                          className="input"
                          type="text"
                          value={editForm.region}
                          onChange={(e) => setEditForm((p) => ({ ...p, region: e.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Country</span>
                        <input
                          className="input"
                          type="text"
                          value={editForm.country}
                          onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Notes</span>
                        <textarea
                          className="input"
                          rows={2}
                          value={editForm.notes}
                          onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                        />
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button onClick={handleSaveEdit} loading={saving} disabled={saving}>
                          Save
                        </Button>
                        <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{assoc.name}</span>
                        <Button
                          variant="ghost"
                          className="button--small"
                          onClick={() => startEdit(assoc)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="button--small"
                          onClick={() => toggleExpanded(assoc.id)}
                        >
                          {isExpanded ? "Hide constituencies" : "Constituencies"}
                        </Button>
                      </div>
                      {assoc.region && (
                        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                          {assoc.region}{assoc.country ? `, ${assoc.country}` : ""}
                        </p>
                      )}
                      {assoc.notes && (
                        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
                          {assoc.notes}
                        </p>
                      )}

                      {isExpanded && (
                        <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: "3px solid #e2e8f0" }}>
                          {loadingCons ? (
                            <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
                          ) : cons.length === 0 ? (
                            <p className="muted" style={{ fontSize: 13 }}>No constituencies linked yet.</p>
                          ) : (
                            <div className="table-wrap" style={{ marginBottom: 12 }}>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Constituency</th>
                                    <th>ONS code</th>
                                    <th>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cons.map((c) => (
                                    <tr key={c.linkId}>
                                      <td>{c.name}</td>
                                      <td>{c.ons_code}</td>
                                      <td>
                                        <Button
                                          variant="ghost"
                                          className="button--small"
                                          loading={unlinking === c.linkId}
                                          disabled={!!unlinking}
                                          onClick={() => handleUnlink(assoc.id, c.linkId)}
                                        >
                                          Unlink
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div style={{ maxWidth: 360 }}>
                            <label className="field" style={{ marginBottom: 6 }}>
                              <span style={{ fontSize: 13 }}>Link constituency</span>
                              <input
                                className="input"
                                type="text"
                                value={conSearch}
                                onChange={(e) => setConSearch(e.target.value)}
                                placeholder="Search by name…"
                              />
                            </label>
                            {conSearching && <p className="muted" style={{ fontSize: 13 }}>Searching…</p>}
                            {conSearchResults.length > 0 && (
                              <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                                {conSearchResults.map((c) => {
                                  const alreadyLinked = cons.some((lc) => lc.id === c.id);
                                  return (
                                    <li
                                      key={c.id}
                                      style={{
                                        padding: "8px 12px",
                                        borderBottom: "1px solid #f1f5f9",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        fontSize: 14,
                                      }}
                                    >
                                      <span>{c.name} <span className="muted">({c.ons_code})</span></span>
                                      {alreadyLinked ? (
                                        <span className="muted" style={{ fontSize: 12 }}>linked</span>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          className="button--small"
                                          loading={linking}
                                          disabled={linking}
                                          onClick={() => handleLink(assoc.id, c.id)}
                                        >
                                          Link
                                        </Button>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
