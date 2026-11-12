import React, { useState } from "react";
import { useAuth } from "../context/Auth.jsx";
import { supabase } from "../lib/supabase.js";
import { t, FONT } from "../ui/theme.js";
import { Button, Input, Field, Card } from "../ui/primitives.jsx";

export default function ResetPassword() {
  const { clearRecovery, signOut } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) { setErr("Паролата трябва да е поне 8 символа."); return; }
    if (pw !== pw2) { setErr("Паролите не съвпадат."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: FONT, display: "grid", placeItems: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.tealDark }}><span style={{ color: t.coral }}>Pro</span>Nutrition</div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>Задай нова парола</div>
        </div>

        {done ? (
          <div style={{ display: "grid", gap: 14, textAlign: "center" }}>
            <div style={{ color: t.good, fontWeight: 700 }}>Паролата е сменена успешно.</div>
            <Button onClick={() => clearRecovery()} style={{ width: "100%" }}>Влез в приложението</Button>
          </div>
        ) : (
          <form onSubmit={save}>
            <Field label="Нова парола"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></Field>
            <Field label="Повтори новата парола"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></Field>
            {err && <div style={{ color: t.warn, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Button type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Запази новата парола"}</Button>
            <button type="button" onClick={async () => { await signOut(); clearRecovery(); }} style={{ display: "block", width: "100%", textAlign: "center", marginTop: 12, background: "none", border: "none", color: t.muted, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>Отказ</button>
          </form>
        )}
      </Card>
    </div>
  );
}
