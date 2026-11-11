import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";

const SEX = { male: "Мъж", female: "Жена" };
const WD = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];
const GOALS = { reduction: "Редукция", maintenance: "Поддръжка", muscle_gain: "Мускулна маса", recomposition: "Рекомпозиция" };

/* Събира ЦЯЛОТО дърво от данни за клиент (за GDPR преносимост, чл.20). */
async function fetchClientBundle(clientId) {
  const { data, error } = await supabase
    .from("clients")
    .select(`*,
      client_measurements(*),
      ai_conversations(*),
      plans(*, plan_versions(*, plan_days(*, plan_meals(*, plan_meal_items(*)))))`)
    .eq("id", clientId)
    .single();
  if (error) throw error;
  return data;
}

function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function Settings() {
  const { profile } = useAuth();
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <h2 style={{ margin: 0, color: t.ink }}>Настройки</h2>

      <Card>
        <div style={{ fontWeight: 700, color: t.ink, marginBottom: 10 }}>Профил</div>
        <div style={{ display: "grid", gap: 6, fontSize: 14, color: t.ink }}>
          <Row k="Име" v={profile?.full_name || "—"} />
          <Row k="Имейл" v={profile?.email} />
          <Row k="Роля" v={profile?.role === "super_admin" ? "Администратор" : "Нутриционист"} />
          <Row k="Статус" v={profile?.status === "active" ? "Активен" : profile?.status} />
        </div>
      </Card>

      <PasswordChange />

      <GdprTools />

      <Card style={{ background: t.tealPale, border: "none", fontSize: 12.5, color: t.tealDark, lineHeight: 1.6 }}>
        <b>За GDPR:</b> като обработващ лични и здравни данни на клиенти носиш отговорност по Регламент (ЕС) 2016/679.
        Инструментите по-горе покриват <b>правото на преносимост</b> (чл.20 — експорт) и <b>правото на изтриване</b> (чл.17 — заличаване).
        Експортът съдържа всички данни за избрания клиент; изтриването е необратимо и премахва мерки, режими и AI разговори, свързани с него.
      </Card>
    </div>
  );
}

function PasswordChange() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function save() {
    setMsg(null);
    if (pw.length < 8) { setMsg({ ok: false, text: "Паролата трябва да е поне 8 символа." }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: "Паролите не съвпадат." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setPw(""); setPw2("");
    setMsg({ ok: true, text: "Паролата е сменена успешно." });
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, color: t.ink, marginBottom: 4 }}>Смяна на парола</div>
      <div style={{ color: t.muted, fontSize: 13, marginBottom: 12 }}>Въведи нова парола за акаунта си (минимум 8 символа).</div>
      <div style={{ display: "grid", gap: 10, maxWidth: 380 }}>
        <Field label="Нова парола"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Повтори новата парола"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        {msg && <div style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? t.good : t.warn }}>{msg.text}</div>}
        <div><Button onClick={save} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Смени паролата"}</Button></div>
      </div>
    </Card>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{ width: 120, color: t.muted }}>{k}</div>
      <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{v}</div>
    </div>
  );
}

function GdprTools() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("id, first_name, last_name, archived")
      .order("first_name");
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const client = rows.find((c) => c.id === clientId);
  const label = (c) => `${c.first_name} ${c.last_name || ""}`.trim() + (c.archived ? " (архив)" : "");

  async function exportJson() {
    if (!client) return;
    setBusy("json"); setMsg(null);
    try {
      const bundle = await fetchClientBundle(clientId);
      const doc = {
        _meta: {
          export_type: "GDPR_data_portability_art20",
          generated_at: new Date().toISOString(),
          app: "PulseMacro Pro",
        },
        client: bundle,
      };
      const safe = label(client).replace(/\s+/g, "_") || "client";
      download(`pulsemacro_${safe}_${clientId.slice(0, 8)}.json`, JSON.stringify(doc, null, 2));
      setMsg({ ok: true, text: "JSON експортът е свален." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy("");
  }

  async function exportPdf() {
    if (!client) return;
    setBusy("pdf"); setMsg(null);
    try {
      const b = await fetchClientBundle(clientId);
      const w = window.open("", "_blank");
      if (!w) { setMsg({ ok: false, text: "Изскачащият прозорец е блокиран от браузъра." }); setBusy(""); return; }
      w.document.write(renderClientHtml(b));
      w.document.close(); w.focus();
      setTimeout(() => w.print(), 350);
      setMsg({ ok: true, text: "Отвори се прозорец за печат/PDF." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy("");
  }

  async function erase() {
    if (!client) return;
    setBusy("del"); setMsg(null);
    try {
      // 1) AI разговори са със SET NULL при триене на клиент — трием ги изрично за пълна заличка.
      await supabase.from("ai_conversations").delete().eq("client_id", clientId);
      // 2) Клиентът — каскадно премахва мерки, планове, версии, дни, хранения, айтеми.
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
      setConfirm(null); setClientId("");
      setMsg({ ok: true, text: `Всички данни за „${label(client)}" са изтрити необратимо.` });
      load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy("");
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, color: t.ink, marginBottom: 4 }}>Данни на клиент (GDPR)</div>
      <div style={{ color: t.muted, fontSize: 13, marginBottom: 12 }}>Експорт или пълно заличаване по заявка от клиента.</div>

      {loading ? <div style={{ color: t.muted }}>Зареждане…</div> : rows.length === 0 ? (
        <div style={{ color: t.muted, fontSize: 14 }}>Нямаш въведени клиенти.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Клиент">
            <Select value={clientId} onChange={setClientId} options={[{ value: "", label: "— избери —" }, ...rows.map((c) => ({ value: c.id, label: label(c) }))]} />
          </Field>

          {client && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={exportJson} style={{ opacity: busy === "json" ? 0.6 : 1 }}>{busy === "json" ? "Събиране…" : "⬇ Експорт JSON"}</Button>
              <Button variant="ghost" onClick={exportPdf} style={{ opacity: busy === "pdf" ? 0.6 : 1 }}>{busy === "pdf" ? "Събиране…" : "🖨 Експорт PDF"}</Button>
              <Button onClick={() => setConfirm(client)} style={{ background: t.warn, borderColor: t.warn }}>🗑 Изтрий всички данни</Button>
            </div>
          )}

          {msg && <div style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? t.good : t.warn }}>{msg.text}</div>}
        </div>
      )}

      {confirm && (
        <EraseConfirm client={confirm} label={label(confirm)} busy={busy === "del"} onCancel={() => setConfirm(null)} onConfirm={erase} />
      )}
    </Card>
  );
}

function EraseConfirm({ client, label, busy, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim() === client.first_name.trim();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,48,47,0.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }} onClick={onCancel}>
      <Card style={{ width: "100%", maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px", color: t.warn }}>Необратимо изтриване</h3>
        <div style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.6, marginBottom: 12 }}>
          Ще бъдат премахнати <b>завинаги</b> всички данни за <b>{label}</b>: профил, мерки, режими и AI разговори.
          Това действие не може да се отмени.
        </div>
        <Field label={`За потвърждение напиши собственото име: „${client.first_name}"`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={client.first_name} />
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <Button variant="ghost" onClick={onCancel}>Отказ</Button>
          <Button onClick={onConfirm} disabled={!ok || busy} style={{ background: ok ? t.warn : t.line, borderColor: ok ? t.warn : t.line, opacity: busy ? 0.6 : 1, cursor: ok && !busy ? "pointer" : "not-allowed" }}>
            {busy ? "Изтриване…" : "Изтрий завинаги"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* Четим HTML за печат/PDF на всички данни за клиента. */
function renderClientHtml(b) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const fld = (k, v) => (v == null || v === "" ? "" : `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`);

  const measures = (b.client_measurements || []).sort((x, y) => (x.measured_on > y.measured_on ? 1 : -1));
  const measRows = measures.map((m) =>
    `<tr><td>${esc(m.measured_on)}</td><td>${esc(m.weight_kg ?? "—")}</td><td>${esc(m.body_fat_pct ?? "—")}</td><td>${esc(m.lean_mass_kg ?? "—")}</td><td>${esc(m.waist_cm ?? "—")}</td></tr>`
  ).join("");

  const plans = (b.plans || []).map((p) => {
    const versions = (p.plan_versions || []).map((v) => {
      const days = (v.plan_days || []).slice().sort((a, c) => (a.weekday ?? 0) - (c.weekday ?? 0)).map((d) => {
        const meals = (d.plan_meals || []).map((meal) => {
          const items = (meal.plan_meal_items || []).map((it) => {
            const s = it.snapshot || {};
            return `<li>${esc(s.name || "продукт")} — ${esc(it.qty)} ${esc(it.unit)}</li>`;
          }).join("");
          return `<div class="meal"><b>${esc(meal.name)}</b><ul>${items || "<li>—</li>"}</ul></div>`;
        }).join("");
        return `<div class="day"><div class="dh">${esc(WD[d.weekday] || "Ден")}</div>${meals}</div>`;
      }).join("");
      return `<div class="ver"><div class="vh">Версия ${esc(v.version)} — ${esc(v.status || "")}</div>${days}</div>`;
    }).join("");
    return `<div class="plan"><h3>Режим: ${esc(p.title)}</h3>${versions || "<i>без версии</i>"}</div>`;
  }).join("");

  const ai = (b.ai_conversations || []).map((c) => {
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const body = msgs.map((m) => `<div class="msg"><b>${esc(m.role === "user" ? "Нутриционист" : "AI")}:</b> ${esc(m.content)}</div>`).join("");
    return `<div class="ai"><div class="dh">${esc(c.created_at || "")}</div>${body || "<i>—</i>"}</div>`;
  }).join("");

  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>Данни — ${esc(b.first_name)} ${esc(b.last_name || "")}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#15302e;margin:28px;font-size:13px}
    h1{font-size:20px;margin:0 0 2px} h2{font-size:15px;border-bottom:2px solid #0E5559;padding-bottom:4px;margin:22px 0 8px;color:#0E5559}
    h3{font-size:14px;margin:12px 0 6px}
    .sub{color:#6b7c7a;font-size:12px;margin-bottom:4px}
    table{border-collapse:collapse;width:100%;margin:6px 0} td,th{border:1px solid #d7e0df;padding:5px 8px;text-align:left}
    th{background:#0E5559;color:#fff} .k{background:#eef4f3;font-weight:600;width:180px}
    .day{border:1px solid #d7e0df;border-radius:6px;padding:8px;margin:6px 0} .dh{font-weight:700;color:#0E5559;margin-bottom:4px}
    .vh{font-weight:700;margin:8px 0 4px} .meal{margin:4px 0} ul{margin:2px 0 6px 18px;padding:0}
    .msg{margin:3px 0} .ai{border:1px solid #d7e0df;border-radius:6px;padding:8px;margin:6px 0}
    @media print{body{margin:12mm}}
  </style></head><body>
    <h1>Експорт на лични данни</h1>
    <div class="sub">PulseMacro Pro · генериран на ${esc(new Date().toLocaleString("bg-BG"))} · GDPR чл.20</div>

    <h2>Профил на клиента</h2>
    <table>
      ${fld("Име", `${b.first_name} ${b.last_name || ""}`)}
      ${fld("Пол", SEX[b.sex] || b.sex)}
      ${fld("Ръст (см)", b.height_cm)}
      ${fld("Тегло (кг)", b.weight_kg)}
      ${fld("Желано тегло (кг)", b.goal_weight_kg)}
      ${fld("Основна цел", GOALS[b.main_goal] || b.main_goal)}
      ${fld("Ниво активност", b.activity_level)}
      ${fld("Диета", b.diet)}
      ${fld("Алергии", b.allergies)}
      ${fld("Изключени храни", b.excluded_foods)}
      ${fld("Бележки", b.private_notes)}
      ${fld("Създаден", b.created_at)}
    </table>

    <h2>История на измерванията (${measures.length})</h2>
    ${measures.length ? `<table><tr><th>Дата</th><th>Тегло</th><th>Мазнини %</th><th>Чиста маса</th><th>Талия</th></tr>${measRows}</table>` : "<i>Няма записи.</i>"}

    <h2>Хранителни режими (${(b.plans || []).length})</h2>
    ${plans || "<i>Няма режими.</i>"}

    <h2>AI разговори (${(b.ai_conversations || []).length})</h2>
    ${ai || "<i>Няма разговори.</i>"}
  </body></html>`;
}
