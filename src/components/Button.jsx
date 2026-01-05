export default function Button({
  as: Component = "button",
  variant = "primary",
  loading = false,
  children,
  className = "",
  type,
  ...props
}) {
  const classes = ["button", variant, className].filter(Boolean).join(" ");
  const isButton = Component === "button" || Component === undefined;
  const resolvedType = isButton ? type || "button" : undefined;
  const disabled = isButton ? props.disabled || loading : undefined;

  return (
    <Component
      className={classes}
      data-loading={loading}
      type={resolvedType}
      disabled={disabled}
      {...props}
    >
      {children}
    </Component>
  );
}
