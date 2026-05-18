export default function PageLayout({ title, description, actions, children, className = "" }) {
  return (
    <div className={["page", className].filter(Boolean).join(" ")}>
      {(title || description || actions) && (
        <div className="card">
          <div className="card-header">
            <div>
              {title && <h1 className="card-title page-layout__title">{title}</h1>}
              {description && <p className="page-layout__description">{description}</p>}
            </div>
            {actions}
          </div>
        </div>
      )}
      <div className="stack">{children}</div>
    </div>
  );
}
