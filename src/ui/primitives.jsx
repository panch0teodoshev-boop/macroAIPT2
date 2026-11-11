import React from "react";
import { t, FONT } from "./theme.js";

export function Button({ children, variant = "primary", style, ...p }) {
  const v = {
    primary: { background: t.coral, color: "#fff", border: "none" },
    teal: { background: t.tealDark, color: "#fff", border: "none" },
    ghost: { background: "#fff", color: t.tealDark, border: `1px solid ${t.line}` },
    danger: { background: "#fff", color: t.warn, border: `1px solid ${t.warn}` },
  }[variant];
  return (
    <button {...p} style={{
      fontFamily: FONT, fontWeight: 700, fontSize: 14, padding: "10px 16px",
      borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center",
      justifyContent: "center", gap: 8, ...v, ...style,
    }}>{children}</button>
  );
}

export const inputStyle = {
  fontFamily: FONT, fontSize: 14, color: t.ink, border: `1px solid ${t.line}`,
  borderRadius: 10, padding: "10px 12px", outline: "none", background: "#fff", width: "100%",
};

export function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.muted, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: t.muted, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function Input(props) { return <input {...props} style={{ ...inputStyle, ...props.style }} />; }

export function Select({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, ...style }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Card({ children, style, ...rest }) {
  return <div {...rest} style={{ background: "#fff", border: `1px solid ${t.line}`, borderRadius: 16, padding: 18, ...style }}>{children}</div>;
}

export function Stat({ label, value, unit, accent }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12.5, color: t.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || t.tealDark, lineHeight: 1.15 }}>
        {value}{unit && <span style={{ fontSize: 13, color: t.muted, fontWeight: 600 }}> {unit}</span>}
      </div>
    </Card>
  );
}
