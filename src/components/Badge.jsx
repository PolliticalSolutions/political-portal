export default function Badge({ tone = "default", children, className = "" }) {
  const toneClass = tone !== "default" ? tone : "";
  const classes = ["badge", toneClass, className].filter(Boolean).join(" ");
  return <span className={classes}>{children}</span>;
}
