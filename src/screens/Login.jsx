import React, { useState } from "react";
import { useAuth } from "../context/Auth.jsx";
import { supabase } from "../lib/supabase.js";
import { t, FONT } from "../ui/theme.js";
import { Button, Input, Field, Card } from "../ui/primitives.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await signIn(email.trim(), password);
    if (error) setErr(error.message === "Invalid login credentials" ? "Грешен имейл или парола." : error.message);
    setBusy(false);
  };

  const sendReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setErr("Въведи имейла на акаунта."); return; }
    setBusy(true); setErr(""); setInfo("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setInfo("Ако има акаунт с този имейл, изпратихме връзка за нулиране. Провери пощата си (и папка Спам).");
  };

  const switchMode = (m) => { setMode(m); setErr(""); setInfo(""); };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: FONT, display: "grid", placeItems: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.tealDark }}>PulseMacro <span style={{ color: t.coral }}>Pro</span></div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>{mode === "login" ? "Вход за специалисти" : "Нулиране на парола"}</div>
        </div>

        {mode === "login" ? (
          <form onSubmit={submit}>
            <Field label="Имейл"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
            <Field label="Парола"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            {err && <div style={{ color: t.warn, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Button type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Влизане…" : "Вход"}</Button>
            <button type="button" onClick={() => switchMode("forgot")} style={linkBtn}>Забравена парола?</button>
          </form>
        ) : (
          <form onSubmit={sendReset}>
            <div style={{ fontSize: 13, color: t.muted, marginBottom: 12, lineHeight: 1.5 }}>Въведи имейла си и ще получиш връзка за задаване на нова парола.</div>
            <Field label="Имейл"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
            {err && <div style={{ color: t.warn, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            {info && <div style={{ color: t.good, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>{info}</div>}
            <Button type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Изпращане…" : "Изпрати връзка за нулиране"}</Button>
            <button type="button" onClick={() => switchMode("login")} style={linkBtn}>← Назад към вход</button>
          </form>
        )}
      </Card>
    </div>
  );
}

const linkBtn = { display: "block", width: "100%", textAlign: "center", marginTop: 12, background: "none", border: "none", color: t.tealDark, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer" };
