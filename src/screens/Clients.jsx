import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";
import { ageFromBirthDate } from "../lib/planMath.mjs";

const GOALS = [
  { value: "reduction", label: "Редукция" },
  { value: "maintenance", label: "Поддръжка" },
  { value: "muscle_gain", label: "Мускулна маса" },
  { value: "recomposition", label: "Рекомпозиция" },
];
const ACTIVITY = [
  { value: "sedentary", label: "Заседнал" }, { value: "light", label: "Ниска" }, { value: "moderate", label: "Умерена" },
  { value: "high", label: "Висока" }, { value: "extreme", label: "Екстремна" },
];
const COLS = "id, first_name, last_name, birth_date, sex, height_cm, weight_kg, goal_weight_kg, main_goal, activity_level, diet, allergies, excluded_foods, private_notes, next_review, archived, created_at";

/** onCalc(client) — отваря калкулатора с данните на клиента; onPlan(client) — отваря режима му. */
export default function Clients({ onCalc, onPlan }) {
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | {} (нов) | клиент (редакция)
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select(COLS).order("first_name").order("last_name");
    setErr(error ? "Клиентите не можаха да се заредят: " + error.message : "");
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((c) => c.archived === showArchived && (!s || `${c.first_name} ${c.last_name || ""}`.toLowerCase().includes(s)));
  }, [rows, q, showArchived]);
  const archivedCount = rows.filter((c) => c.archived).length;

  async function setArchived(c, archived) {
    if (archived && !confirm(`Да архивирам ${c.first_name} ${c.last_name || ""}? Данните се запазват; клиентът се скрива от списъците.`)) return;
    const { error } = await supabase.from("clients").update({ archived }).eq("id", c.id);
    if (error) { setErr("Промяната не успя: " + error.message); return; }
    load();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, color: t.ink }}>Моите клиенти</h2>
        <Button onClick={() => setForm({})}>+ Нов клиент</Button>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси по име…" aria-label="Търсене на клиент" style={{ maxWidth: 280 }} />
        {archivedCount > 0 && <label style={{ fontSize: 13, color: t.muted, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Архивирани ({archivedCount})
        </label>}
        <span style={{ fontSize: 12.5, color: t.muted }}>{loading ? "" : `${shown.length} клиента`}</span>
      </div>
      {err && <Card role="alert" style={{ color: t.warn }}>{err}</Card>}

      {loading ? <Card>Зареждане…</Card> : shown.length === 0 ? (
        <Card style={{ color: t.muted }}>{rows.length === 0 ? "Още няма клиенти. Добави първия с бутона „Нов клиент“." : "Няма клиенти по тези критерии."}</Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: t.tealDark, color: "#fff", textAlign: "left" }}>
                  <th style={th}>Име</th><th style={th}>Пол / възраст</th><th style={th}>Тегло</th><th style={th}>Цел</th><th style={th}>Преглед</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c, i) => {
                  const age = ageFromBirthDate(c.birth_date);
                  const missing = [!c.birth_date && "рождена дата", !c.weight_kg && "тегло", !c.height_cm && "ръст"].filter(Boolean);
                  return (
                    <tr key={c.id} style={{ background: i % 2 ? t.tealPale : "#fff" }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{c.first_name} {c.last_name || ""}</div>
                        {missing.length > 0 && <div style={{ fontSize: 11.5, color: t.warn }}>липсва: {missing.join(", ")}</div>}
                      </td>
                      <td style={td}>{c.sex === "male" ? "М" : c.sex === "female" ? "Ж" : "—"}{age != null ? ` · ${age} г.` : ""}</td>
                      <td style={td}>{c.weight_kg ? `${c.weight_kg} кг` : "—"}</td>
                      <td style={td}>{GOALS.find((g) => g.value === c.main_goal)?.label || "—"}</td>
                      <td style={td}>{c.next_review || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <Button variant="ghost" style={btn} onClick={() => setForm(c)}>Редактирай</Button>
                          {!c.archived && <Button variant="ghost" style={btn} onClick={() => onPlan?.(c)}>Режим</Button>}
                          {!c.archived && <Button variant="ghost" style={btn} onClick={() => onCalc?.(c)}>Калкулатор</Button>}
                          <Button variant="ghost" style={{ ...btn, color: t.muted }} onClick={() => setArchived(c, !c.archived)}>{c.archived ? "Върни" : "Архивирай"}</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {form && <ClientForm nutritionistId={session.user.id} client={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </div>
  );
}

const EMPTY = { first_name: "", last_name: "", birth_date: "", sex: "male", height_cm: "", weight_kg: "", goal_weight_kg: "", main_goal: "maintenance", activity_level: "moderate", diet: "", allergies: "", excluded_foods: "", private_notes: "", next_review: "" };

function ClientForm({ nutritionistId, client, onClose, onSaved }) {
  const [f, setF] = useState(() => {
    if (!client) return EMPTY;
    const o = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) if (client[k] != null) o[k] = String(client[k]);
    return o;
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const today = new Date().toISOString().slice(0, 10);

  const save = async () => {
    if (busy) return;
    if (!f.first_name.trim()) { setErr("Името е задължително."); return; }
    const h = num(f.height_cm), w = num(f.weight_kg), g = num(f.goal_weight_kg);
    if (h != null && !(h >= 100 && h <= 250)) { setErr("Ръстът трябва да е между 100 и 250 см."); return; }
    if (w != null && !(w >= 25 && w <= 350)) { setErr("Теглото трябва да е между 25 и 350 кг."); return; }
    if (g != null && !(g >= 25 && g <= 350)) { setErr("Желаното тегло трябва да е между 25 и 350 кг."); return; }
    if (f.birth_date && (f.birth_date > today || ageFromBirthDate(f.birth_date) == null)) { setErr("Невалидна рождена дата."); return; }
    setBusy(true); setErr("");
    const payload = {
      first_name: f.first_name.trim(), last_name: f.last_name.trim() || null,
      birth_date: f.birth_date || null, sex: f.sex, height_cm: h, weight_kg: w, goal_weight_kg: g,
      main_goal: f.main_goal, activity_level: f.activity_level,
      diet: f.diet.trim() || null, allergies: f.allergies.trim() || null, excluded_foods: f.excluded_foods.trim() || null,
      private_notes: f.private_notes.trim() || null, next_review: f.next_review || null,
    };
    const { error } = client
      ? await supabase.from("clients").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", client.id)
      : await supabase.from("clients").insert({ ...payload, nutritionist_id: nutritionistId });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div style={overlay} onClick={busy ? undefined : onClose}>
      <Card style={{ width: "100%", maxWidth: 520, maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px", color: t.ink }}>{client ? "Редакция на клиент" : "Нов клиент"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Име *"><Input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} autoFocus={!client} /></Field>
          <Field label="Фамилия"><Input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
          <Field label="Рождена дата" hint="нужна за точна калорийна цел"><Input type="date" max={today} value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
          <Field label="Пол"><Select value={f.sex} onChange={(v) => set("sex", v)} options={[{ value: "male", label: "Мъж" }, { value: "female", label: "Жена" }]} /></Field>
          <Field label="Ръст (см)"><Input type="number" inputMode="decimal" value={f.height_cm} onChange={(e) => set("height_cm", e.target.value)} /></Field>
          <Field label="Тегло (кг)"><Input type="number" inputMode="decimal" value={f.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></Field>
          <Field label="Желано тегло (кг)"><Input type="number" inputMode="decimal" value={f.goal_weight_kg} onChange={(e) => set("goal_weight_kg", e.target.value)} /></Field>
          <Field label="Цел"><Select value={f.main_goal} onChange={(v) => set("main_goal", v)} options={GOALS} /></Field>
          <Field label="Активност"><Select value={f.activity_level} onChange={(v) => set("activity_level", v)} options={ACTIVITY} /></Field>
          <Field label="Следващ преглед"><Input type="date" value={f.next_review} onChange={(e) => set("next_review", e.target.value)} /></Field>
        </div>
        <Field label="Диета / хранителен режим" hint="напр. вегетарианска, без глутен"><Input value={f.diet} onChange={(e) => set("diet", e.target.value)} /></Field>
        <Field label="Алергии / непоносимости"><Input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} /></Field>
        <Field label="Изключени храни"><Input value={f.excluded_foods} onChange={(e) => set("excluded_foods", e.target.value)} /></Field>
        <Field label="Конфиденциални бележки" hint="не се изпращат към AI; без диагнози">
          <textarea value={f.private_notes} onChange={(e) => set("private_notes", e.target.value)} rows={3} style={{ width: "100%", fontFamily: "inherit", fontSize: 14, color: t.ink, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 12px", outline: "none", resize: "vertical" }} />
        </Field>
        {err && <div role="alert" style={{ color: t.warn, fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отказ</Button>
          <Button onClick={save} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Запази"}</Button>
        </div>
      </Card>
    </div>
  );
}

const num = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
const th = { padding: "10px 12px", fontSize: 12.5, fontWeight: 700 };
const td = { padding: "10px 12px", borderBottom: `1px solid ${t.line}`, color: t.ink };
const btn = { padding: "6px 10px", fontSize: 12.5 };
const overlay = { position: "fixed", inset: 0, background: "rgba(14,48,47,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 };
