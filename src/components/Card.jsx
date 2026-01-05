export default function Card({ title, action, children, className = "" }) {
  const classes = ["card", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {(title || action) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
