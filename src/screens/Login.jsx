import React, { useState } from "react";
import { useAuth } from "../context/Auth.jsx";
import { t, FONT } from "../ui/theme.js";
import { Button, Input, Field, Card } from "../ui/primitives.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await signIn(email.trim(), password);
    if (error) setErr(error.message === "Invalid login credentials" ? "Грешен имейл или парола." : error.message);
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: FONT, display: "grid", placeItems: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.tealDark }}>PulseMacro <span style={{ color: t.coral }}>Pro</span></div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>Вход за специалисти</div>
        </div>
        <form onSubmit={submit}>
          <Field label="Имейл"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
          <Field label="Парола"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          {err && <div style={{ color: t.warn, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <Button type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Влизане…" : "Вход"}</Button>
        </form>
      </Card>
    </div>
  );
}
