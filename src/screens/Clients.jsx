import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";

const GOALS = [
  { value: "reduction", label: "Редукция" },
  { value: "maintenance", label: "Поддръжка" },
  { value: "muscle_gain", label: "Мускулна маса" },
  { value: "recomposition", label: "Рекомпозиция" },
];

export default function Clients({ onOpen }) {
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, first_name, last_name, sex, height_cm, weight_kg, goal_weight_kg, main_goal, next_review, created_at")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: t.ink }}>Моите клиенти</h2>
        <Button onClick={() => setAdding(true)}>+ Нов клиент</Button>
      </div>
      {err && <Card style={{ color: t.warn }}>{err}</Card>}

      {loading ? <Card>Зареждане…</Card> : rows.length === 0 ? (
        <Card style={{ color: t.muted }}>Още няма клиенти. Добави първия с „Нов клиент".</Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
         <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: t.tealDark, color: "#fff", textAlign: "left" }}>
                <th style={th}>Име</th><th style={th}>Пол</th><th style={th}>Тегло</th><th style={th}>Цел</th><th style={th}>Преглед</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 ? t.tealPale : "#fff" }}>
                  <td style={td}>{c.first_name} {c.last_name || ""}</td>
                  <td style={td}>{c.sex === "male" ? "М" : c.sex === "female" ? "Ж" : "—"}</td>
                  <td style={td}>{c.weight_kg ? `${c.weight_kg} кг` : "—"}</td>
                  <td style={td}>{GOALS.find((g) => g.value === c.main_goal)?.label || "—"}</td>
                  <td style={td}>{c.next_review || "—"}</td>
                  <td style={td}><Button variant="ghost" style={{ padding: "6px 12px" }} onClick={() => onOpen?.(c)}>Отвори</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
        </Card>
      )}

      {adding && <ClientForm nutritionistId={session.user.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function ClientForm({ nutritionistId, onClose, onSaved }) {
  const [f, setF] = useState({ first_name: "", last_name: "", sex: "male", height_cm: "", weight_kg: "", goal_weight_kg: "", main_goal: "maintenance", activity_level: "moderate", allergies: "", private_notes: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!f.first_name.trim()) { setErr("Името е задължително."); return; }
    setBusy(true); setErr("");
    const payload = {
      nutritionist_id: nutritionistId,
      first_name: f.first_name.trim(), last_name: f.last_name.trim() || null,
      sex: f.sex, height_cm: num(f.height_cm), weight_kg: num(f.weight_kg), goal_weight_kg: num(f.goal_weight_kg),
      main_goal: f.main_goal, activity_level: f.activity_level,
      allergies: f.allergies.trim() || null, private_notes: f.private_notes.trim() || null,
    };
    const { error } = await supabase.from("clients").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div style={overlay} onClick={onClose}>
      <Card style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px", color: t.ink }}>Нов клиент</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Име *"><Input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
          <Field label="Фамилия"><Input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
          <Field label="Пол"><Select value={f.sex} onChange={(v) => set("sex", v)} options={[{ value: "male", label: "Мъж" }, { value: "female", label: "Жена" }]} /></Field>
          <Field label="Цел"><Select value={f.main_goal} onChange={(v) => set("main_goal", v)} options={GOALS} /></Field>
          <Field label="Ръст (см)"><Input type="number" value={f.height_cm} onChange={(e) => set("height_cm", e.target.value)} /></Field>
          <Field label="Тегло (кг)"><Input type="number" value={f.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></Field>
          <Field label="Желано тегло"><Input type="number" value={f.goal_weight_kg} onChange={(e) => set("goal_weight_kg", e.target.value)} /></Field>
          <Field label="Активност"><Select value={f.activity_level} onChange={(v) => set("activity_level", v)} options={[
            { value: "sedentary", label: "Заседнал" }, { value: "light", label: "Ниска" }, { value: "moderate", label: "Умерена" }, { value: "high", label: "Висока" }, { value: "extreme", label: "Екстремна" }]} /></Field>
        </div>
        <Field label="Алергии / непоносимости"><Input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} /></Field>
        <Field label="Конфиденциални бележки" hint="без диагнози"><Input value={f.private_notes} onChange={(e) => set("private_notes", e.target.value)} /></Field>
        {err && <div style={{ color: t.warn, fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Отказ</Button>
          <Button onClick={save} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Запази"}</Button>
        </div>
      </Card>
    </div>
  );
}

const num = (v) => (v === "" || v == null ? null : Number(v));
const th = { padding: "10px 12px", fontSize: 12.5, fontWeight: 700 };
const td = { padding: "10px 12px", borderBottom: `1px solid ${t.line}`, color: t.ink };
const overlay = { position: "fixed", inset: 0, background: "rgba(14,48,47,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 };
