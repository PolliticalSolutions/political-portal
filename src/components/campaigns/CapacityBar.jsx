export default function CapacityBar({ filled, max }) {
  if (max == null) return null;
  const pct = max > 0 ? Math.min(100, Math.round((filled / max) * 100)) : 0;
  const isFull = filled >= max;
  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--text-xs)",
          color: "var(--portal-text-secondary)",
          marginBottom: 4,
        }}
      >
        <span>{filled} / {max} attending</span>
        {isFull && <span style={{ color: "var(--portal-danger)" }}>Full</span>}
      </div>
      <div
        style={{
          height: 4,
          background: "var(--portal-surface-raised)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: isFull ? "var(--portal-danger)" : "var(--portal-cta)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}
