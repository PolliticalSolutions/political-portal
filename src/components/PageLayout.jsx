export default function PageLayout({ title, description, actions, children, className = "" }) {
  return (
    <div className={["page", className].filter(Boolean).join(" ")}>
      {(title || description || actions) && (
        <div className="card">
          <div className="card-header">
            <div>
              {title && <h1 className="card-title" style={{ fontSize: 22, margin: 0 }}>{title}</h1>}
              {description && <p style={{ margin: "6px 0 0", color: "var(--text-muted)" }}>{description}</p>}
            </div>
            {actions}
          </div>
        </div>
      )}
      <div className="stack">{children}</div>
    </div>
  );
}
