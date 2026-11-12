import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";

const STATUS = [
  { value: "invited", label: "Поканен" },
  { value: "active", label: "Активен" },
  { value: "disabled", label: "Деактивиран" },
  { value: "blocked", label: "Блокиран" },
];
const statusColor = (s) => ({ active: t.good, invited: t.teal, disabled: t.muted, blocked: t.warn }[s] || t.muted);

export default function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("nutritionists");
  if (profile?.role !== "super_admin") return <Card style={{ color: t.warn }}>Само за администратор.</Card>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0, color: t.ink, flex: 1 }}>Админ панел</h2>
        <div style={{ display: "inline-flex", background: t.tealPale, borderRadius: 10, padding: 3 }}>
          {[["nutritionists", "Нутриционисти"], ["audit", "Логове"]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 13.5, background: tab === id ? "#fff" : "transparent", color: tab === id ? t.tealDark : t.muted }}>{l}</button>
          ))}
        </div>
      </div>
      {tab === "nutritionists" ? <Nutritionists /> : <Audit />}
    </div>
  );
}

function Nutritionists() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("id, email, full_name, role, status, client_limit, created_at").order("created_at");
    if (error) setMsg("Профилите не можаха да се заредят: " + error.message);
    setRows(data || []);
    // Брой клиенти: админът няма достъп до самите клиенти (RLS), затова броим през функцията
    // admin_client_counts() от миграция 0004. Докато тя не е приложена → null („няма данни"), не подвеждаща 0.
    const { data: cc, error: ce } = await supabase.rpc("admin_client_counts");
    if (ce) setCounts(null);
    else { const map = {}; (cc || []).forEach((r) => (map[r.nutritionist_id] = Number(r.active_clients))); setCounts(map); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function logAction(action, target, meta) {
    // запис в журнала (insert позволен на админ чрез RLS? таблицата е само за четене от админ; записваме best-effort)
    const { error } = await supabase.from("admin_audit").insert({ actor_id: profile.id, action, target, meta });
    if (error) console.warn("Одит записът не успя:", error.message);
  }

  async function setStatus(r, status) {
    if (r.id === profile.id) { setMsg("Не можеш да променяш собствения си статус."); return; }
    if (status !== "active" && !confirm(`${r.email} ще загуби достъп до приложението. Продължаваме ли?`)) return;
    const { error } = await supabase.from("profiles").update({ status }).eq("id", r.id);
    if (error) { setMsg("Смяната на статуса не успя: " + error.message); return; }
    await logAction("set_status", r.email, { from: r.status, to: status });
    setMsg(`Статусът на ${r.email} е променен.`); load();
  }
  async function setLimit(r, client_limit) {
    if (client_limit != null && (!Number.isInteger(client_limit) || client_limit < 0)) { setMsg("Лимитът трябва да е цяло число ≥ 0 (празно = без лимит)."); load(); return; }
    const { error } = await supabase.from("profiles").update({ client_limit }).eq("id", r.id);
    if (error) { setMsg("Смяната на лимита не успя: " + error.message); return; }
    await logAction("set_limit", r.email, { from: r.client_limit, to: client_limit });
    setMsg(`Лимитът на ${r.email} е променен.`); load();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: t.muted, fontSize: 13 }}>{loading ? "Зареждане…" : `${rows.length} профила`}</div>
        <Button onClick={() => setAdding(true)}>+ Нов нутриционист</Button>
      </div>
      {msg && <Card style={{ background: t.tealPale, border: "none", color: t.tealDark, fontSize: 13 }}>{msg}</Card>}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: t.tealDark, color: "#fff", textAlign: "left" }}>
              <th style={th}>Име / имейл</th><th style={th}>Роля</th><th style={th}>Статус</th><th style={thC}>Клиенти</th><th style={thC}>Лимит</th><th style={th}>Действия</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 ? t.tealPale : "#fff" }}>
                  <td style={td}><div style={{ fontWeight: 600 }}>{r.full_name || "—"}</div><div style={{ fontSize: 12, color: t.muted }}>{r.email}</div></td>
                  <td style={td}>{r.role === "super_admin" ? "Админ" : "Нутриционист"}</td>
                  <td style={td}><span style={{ color: statusColor(r.status), fontWeight: 700 }}>{STATUS.find((s) => s.value === r.status)?.label || r.status}</span></td>
                  <td style={tdC} title={counts ? undefined : "Нужна е миграция 0004"}>{counts ? (counts[r.id] || 0) : "—"}</td>
                  <td style={tdC}>
                    <input type="number" min={0} step={1} aria-label={`Лимит клиенти за ${r.email}`} key={`${r.id}:${r.client_limit}`} defaultValue={r.client_limit ?? ""} placeholder="∞" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.client_limit) setLimit(r, v); }} style={{ width: 60, textAlign: "center", border: `1px solid ${t.line}`, borderRadius: 6, padding: "4px" }} />
                  </td>
                  <td style={td}>
                    {r.role !== "super_admin" && <Select value={r.status} onChange={(v) => setStatus(r, v)} style={{ width: "auto", padding: "4px 8px", fontSize: 12.5 }} options={STATUS} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {adding && <NewNutritionist onClose={() => setAdding(false)} onCreated={(m) => { setAdding(false); setMsg(m); load(); }} onLog={logAction} />}
    </div>
  );
}

function NewNutritionist({ onClose, onCreated, onLog }) {
  const [f, setF] = useState({ full_name: "", email: "", client_limit: "", user_id: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (busy) return;
    if (!f.email.trim() || !f.user_id.trim()) { setErr("Имейл и User UID са задължителни."); return; }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.user_id.trim())) { setErr("User UID не е валиден (очаква се формат xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("profiles").insert({
      id: f.user_id.trim(), email: f.email.trim(), full_name: f.full_name.trim() || null,
      role: "nutritionist", status: "active", client_limit: f.client_limit === "" ? null : Number(f.client_limit),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onLog?.("create_nutritionist", f.email.trim(), {});
    onCreated(`Профилът на ${f.email.trim()} е създаден и активен.`);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,48,47,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }} onClick={onClose}>
      <Card style={{ width: "100%", maxWidth: 480, maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", color: t.ink }}>Нов нутриционист</h3>
        <div style={{ background: t.tealPale, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: t.tealDark, marginBottom: 12, lineHeight: 1.5 }}>
          <b>Стъпка 1:</b> в Supabase → Authentication → Users → <i>Add user</i> създай потребителя (имейл + временна парола, Auto Confirm). Копирай <b>User UID</b>.<br />
          <b>Стъпка 2:</b> попълни данните тук със същия UID. Профилът става активен веднага.
        </div>
        <Field label="Име"><Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
        <Field label="Имейл *"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="User UID (от Supabase Auth) *"><Input value={f.user_id} onChange={(e) => set("user_id", e.target.value)} placeholder="напр. 36ad812b-7187-…" /></Field>
        <Field label="Лимит клиенти (празно = без лимит)"><Input type="number" value={f.client_limit} onChange={(e) => set("client_limit", e.target.value)} /></Field>
        {err && <div style={{ color: t.warn, fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Отказ</Button>
          <Button onClick={save} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Създай профил"}</Button>
        </div>
      </Card>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("admin_audit").select("id, action, target, meta, created_at").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {loading ? <div style={{ padding: 16, color: t.muted }}>Зареждане…</div> : rows.length === 0 ? <div style={{ padding: 16, color: t.muted }}>Няма записани действия.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: t.tealDark, color: "#fff", textAlign: "left" }}><th style={th}>Време</th><th style={th}>Действие</th><th style={th}>Обект</th><th style={th}>Детайли</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 ? t.tealPale : "#fff" }}>
                  <td style={td}>{new Date(r.created_at).toLocaleString("bg-BG")}</td>
                  <td style={td}>{r.action}</td><td style={td}>{r.target}</td>
                  <td style={{ ...td, color: t.muted, fontSize: 12 }}>{r.meta ? JSON.stringify(r.meta) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const th = { padding: "9px 12px", fontSize: 12, fontWeight: 700 };
const thC = { ...th, textAlign: "center" };
const td = { padding: "9px 12px", borderBottom: `1px solid ${t.line}`, color: t.ink };
const tdC = { ...td, textAlign: "center" };
