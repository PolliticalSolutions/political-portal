import { useMemo, useState } from "react";
import Button from "./Button.jsx";

const phoneRegex = /^0\d{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRules = {
  length: (value) => value.length >= 8,
  uppercase: (value) => /[A-Z]/.test(value),
  number: (value) => /\d/.test(value),
  special: (value) => /[^A-Za-z0-9]/.test(value),
};

function getPasswordStrength(password) {
  const passed = Object.values(passwordRules).filter((rule) => rule(password)).length;
  if (!password) return { label: "Enter a password", className: "muted", passed };
  if (passed <= 2) return { label: "Weak", className: "status error", passed };
  if (passed === 3) return { label: "Almost there", className: "status warning", passed };
  return { label: "Strong", className: "status success", passed };
}

function validateForm(form) {
  const nextErrors = {};
  if (!form.name.trim()) nextErrors.name = "Name is required.";
  if (!form.email.trim()) {
    nextErrors.email = "Email address is required.";
  } else if (!emailRegex.test(form.email.trim())) {
    nextErrors.email = "Enter a valid email address.";
  }
  if (!form.phone.trim()) {
    nextErrors.phone = "Phone number is required.";
  } else if (!phoneRegex.test(form.phone.trim())) {
    nextErrors.phone = "Enter an 11 digit UK number starting with 0, for example 07700900000.";
  }
  if (!form.associationId) nextErrors.associationId = "Association/Federation is required.";
  if (!form.password) {
    nextErrors.password = "Password is required.";
  } else if (!Object.values(passwordRules).every((rule) => rule(form.password))) {
    nextErrors.password =
      "Password must be at least 8 characters and include an uppercase letter, a number, and a special character.";
  }
  if (!form.confirmPassword) {
    nextErrors.confirmPassword = "Confirm your password.";
  } else if (form.confirmPassword !== form.password) {
    nextErrors.confirmPassword = "Passwords do not match.";
  }
  return nextErrors;
}

export default function SignupForm({
  associations,
  form,
  loading,
  submitting,
  errors = {},
  onChange,
  onSubmit,
  onValidationChange,
}) {
  const [localErrors, setLocalErrors] = useState({});
  const fieldErrors = { ...localErrors, ...errors };
  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  const handleChange = (event) => {
    const { name } = event.target;
    setLocalErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    onValidationChange?.({});
    onChange(event);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setLocalErrors(nextErrors);
    onValidationChange?.(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(event);
  };

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          name="name"
          value={form.name}
          onChange={handleChange}
          autoComplete="name"
          required
        />
        {fieldErrors.name && <span className="status error">{fieldErrors.name}</span>}
      </label>

      <label className="field">
        <span>Email Address</span>
        <input
          className="input"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />
        {fieldErrors.email && <span className="status error">{fieldErrors.email}</span>}
      </label>

      <label className="field">
        <span>Phone Number</span>
        <input
          className="input"
          name="phone"
          value={form.phone}
          onChange={handleChange}
          autoComplete="tel"
          inputMode="numeric"
          pattern="0[0-9]{10}"
          placeholder="07700900000"
          required
        />
        {fieldErrors.phone && <span className="status error">{fieldErrors.phone}</span>}
      </label>

      <label className="field">
        <span>Association/Federation</span>
        <select
          className="input"
          name="associationId"
          value={form.associationId}
          onChange={handleChange}
          disabled={loading}
          required
        >
          <option value="">Select an association</option>
          {associations.map((association) => (
            <option key={association.id} value={association.id}>
              {association.name}
            </option>
          ))}
        </select>
        {fieldErrors.associationId && <span className="status error">{fieldErrors.associationId}</span>}
      </label>

      <label className="field">
        <span>Password</span>
        <input
          className="input"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="new-password"
          required
        />
        <span className={strength.className}>
          Password strength: {strength.label}
        </span>
        {fieldErrors.password && <span className="status error">{fieldErrors.password}</span>}
      </label>

      <label className="field">
        <span>Confirm password</span>
        <input
          className="input"
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={handleChange}
          autoComplete="new-password"
          required
        />
        {fieldErrors.confirmPassword && <span className="status error">{fieldErrors.confirmPassword}</span>}
      </label>

      <Button type="submit" variant="primary" loading={submitting} disabled={submitting || loading}>
        Create account
      </Button>
    </form>
  );
}
