export default function Badge({ tone = "default", children, className = "" }) {
  const classes = ["badge", tone === "accent" ? "accent" : "", className].filter(Boolean).join(" ");
  return <span className={classes}>{children}</span>;
}
