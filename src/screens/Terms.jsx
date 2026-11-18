// Общи условия: публична страница (/terms) и екран за задължително приемане при влизане.
import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t, FONT } from "../ui/theme.js";
import { Button, Card } from "../ui/primitives.jsx";
import { TERMS, TERMS_VERSION, TERMS_EFFECTIVE } from "../legal/terms.js";

export function TermsText() {
  const cell = { padding: "7px 10px", borderBottom: `1px solid ${t.line}`, textAlign: "left", verticalAlign: "top", fontSize: 13.5 };
  return (
    <div style={{ color: t.ink, fontSize: 14.5, lineHeight: 1.6, display: "grid", gap: 10 }}>
      {TERMS.map((b, i) => {
        if (b.title) return <h1 key={i} style={{ margin: 0, fontSize: 22, color: t.tealDark }}>{b.title}</h1>;
        if (b.meta) return <div key={i} style={{ color: t.muted, fontSize: 13 }}>{b.meta.join(" · ")}</div>;
        if (b.h) return <h2 key={i} style={{ margin: "10px 0 0", fontSize: 17, color: t.tealDark }}>{b.h}</h2>;
        if (b.h3) return <h3 key={i} style={{ margin: "4px 0 0", fontSize: 15, color: t.ink }}>{b.h3}</h3>;
        if (b.p) return <p key={i} style={{ margin: 0 }}>{b.p}</p>;
        if (b.ul) return <ul key={i} style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 4 }}>{b.ul.map((x, j) => <li key={j}>{x}</li>)}</ul>;
        if (b.dl) return <ul key={i} style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6 }}>{b.dl.map(([k, v], j) => <li key={j}><b>{k}:</b> {v}</li>)}</ul>;
        if (b.table) return (
          <div key={i} style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
              <thead><tr>{b.table.head.map((h) => <th key={h} style={{ ...cell, background: t.tealPale, color: t.tealDark }}>{h}</th>)}</tr></thead>
              <tbody>{b.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={cell}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return null;
      })}
    </div>
  );
}

const Logo = () => <div style={{ fontSize: 20, fontWeight: 800, color: t.tealDark }}><span style={{ color: t.coral }}>Pro</span>Nutrition</div>;

/** Публична страница /terms — достъпна и без вход. */
export function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: FONT, padding: "24px 16px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Logo /><div style={{ flex: 1 }} /><a href="/" style={{ color: t.tealDark, fontWeight: 700, fontSize: 14 }}>← Към приложението</a></div>
        <Card><TermsText /></Card>
      </div>
    </div>
  );
}

/** Задължително приемане на текущата версия при влизане. Записва се дата и версия. */
export function AcceptTerms({ onAccepted, previous }) {
  const { session, signOut } = useAuth();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const accept = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.from("terms_acceptances").insert({ user_id: session.user.id, version: TERMS_VERSION });
    setBusy(false);
    if (error && !/duplicate|23505/i.test(error.message + (error.code || ""))) { setErr("Приемането не се записа: " + error.message); return; }
    onAccepted();
  };
  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: FONT, padding: "20px 14px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 12 }}>
        <Logo />
        <Card style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>{previous ? "Общите условия са променени" : "Преди да продължиш"}</div>
          <div style={{ color: t.muted, fontSize: 13.5 }}>{previous ? "Прочети новата версия и я приеми, за да продължиш." : "Прочети Общите условия за ползване и ги приеми, за да влезеш в ProNutrition."} Версия в сила от {TERMS_EFFECTIVE}.</div>
        </Card>
        <Card style={{ maxHeight: "55vh", overflowY: "auto" }} tabIndex={0} aria-label="Текст на Общите условия"><TermsText /></Card>
        <Card style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: t.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ width: 18, height: 18, accentColor: t.coral, marginTop: 2 }} />
            <span>Прочетох и приемам Общите условия за ползване на ProNutrition, включително задълженията ми при работа с данни на клиенти (т. 3) и правилата за AI асистента (т. 5).</span>
          </label>
          {err && <div role="alert" style={{ color: t.warn, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={signOut}>Изход</Button>
            <Button onClick={accept} disabled={!ok || busy} style={{ opacity: !ok || busy ? 0.5 : 1, cursor: ok && !busy ? "pointer" : "not-allowed" }}>{busy ? "Запис…" : "Приемам и продължавам"}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
