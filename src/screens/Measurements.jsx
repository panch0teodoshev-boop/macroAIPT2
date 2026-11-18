import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input } from "../ui/primitives.jsx";
import { round } from "../lib/nutrition.mjs";
import { METRICS, validateMeasurement, seriesOf, trend, todayIso, isLatest } from "../lib/measurements.mjs";

const COLS = "id, measured_on, weight_kg, body_fat_pct, lean_mass_kg, skeletal_muscle_kg, waist_cm, created_at";
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const fmtShort = (iso) => { const [, m, d] = iso.split("-"); return `${d}.${m}`; };
const signed = (v, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${round(Math.abs(v), d)}`;
const emptyForm = () => ({ measured_on: todayIso(), ...Object.fromEntries(METRICS.map((m) => [m.key, ""])) });

/** Мерки на клиент: въвеждане, графика по избрана мярка и история. onProfileUpdated — когато е обновено теглото в профила. */
export default function Measurements({ client, onClose, onProfileUpdated }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState([]);
  const [updateProfile, setUpdateProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [metric, setMetric] = useState("weight_kg");
  const name = `${client.first_name} ${client.last_name || ""}`.trim();

  async function load() {
    const { data, error } = await supabase.from("client_measurements").select(COLS).eq("client_id", client.id).order("measured_on", { ascending: false });
    if (error) { setErr("Мерките не можаха да се заредят: " + error.message); setList([]); return; }
    setErr(""); setList(data || []);
  }
  useEffect(() => { load(); }, [client.id]);

  const series = useMemo(() => seriesOf(list, metric), [list, metric]);
  const tr = useMemo(() => trend(series), [series]);
  const M = METRICS.find((m) => m.key === metric);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setFormErr([]); setMsg(""); };

  async function save() {
    const { row, errors } = validateMeasurement(form);
    if (errors.length) { setFormErr(errors); return; }
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.from("client_measurements").insert({ client_id: client.id, ...row });
      if (error) throw error;
      let note = "";
      if (row.weight_kg != null && updateProfile) {
        if (isLatest(row.measured_on, list)) {
          const { error: e2 } = await supabase.from("clients").update({ weight_kg: row.weight_kg }).eq("id", client.id);
          if (e2) note = " Теглото в профила НЕ беше обновено: " + e2.message;
          else { note = ` Теглото в профила е обновено на ${row.weight_kg} кг.`; onProfileUpdated?.(); }
        } else note = " Профилът не е променен, защото има по-ново измерване.";
      }
      setMsg(`Измерването от ${fmtDate(row.measured_on)} е записано.${note}`);
      setForm(emptyForm());
      if (row[metric] == null) { const firstKey = METRICS.find((m) => row[m.key] != null)?.key; if (firstKey) setMetric(firstKey); }
      await load();
    } catch (e) {
      setFormErr(["Записът не успя: " + (e.message || e)]);
    } finally { setBusy(false); }
  }

  async function remove(r) {
    if (!confirm(`Да изтрия измерването от ${fmtDate(r.measured_on)}?`)) return;
    const { error } = await supabase.from("client_measurements").delete().eq("id", r.id);
    if (error) { setErr("Изтриването не успя: " + error.message); return; }
    setMsg(""); await load();
  }

  const counts = useMemo(() => Object.fromEntries(METRICS.map((m) => [m.key, seriesOf(list, m.key).length])), [list]);

  return (
    <div style={overlay} onClick={onClose}>
      <Card style={{ width: "100%", maxWidth: 860, maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: t.ink, flex: 1 }}>Мерки — {name}</h3>
          <Button variant="ghost" onClick={onClose} style={{ padding: "6px 12px" }}>Затвори</Button>
        </div>

        {/* въвеждане */}
        <div style={{ background: t.tealPale, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, alignItems: "end" }}>
            <Field label="Дата"><Input type="date" value={form.measured_on} max={todayIso()} onChange={(e) => set("measured_on", e.target.value)} /></Field>
            {METRICS.map((m) => (
              <Field key={m.key} label={`${m.label} (${m.unit})`}><Input inputMode="decimal" value={form[m.key]} onChange={(e) => set(m.key, e.target.value)} /></Field>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Button onClick={save} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Записване…" : "Добави измерване"}</Button>
            {String(form.weight_kg).trim() !== "" && (
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: t.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={updateProfile} onChange={(e) => setUpdateProfile(e.target.checked)} style={{ width: 16, height: 16, accentColor: t.coral }} />
                Обнови теглото в профила (ползва се от калкулатора и целта)
              </label>
            )}
          </div>
          {formErr.length > 0 && <div role="alert" style={{ color: t.warn, fontSize: 13, marginTop: 8 }}>{formErr.map((e) => <div key={e}>{e}</div>)}</div>}
          {msg && <div role="status" style={{ color: t.good, fontSize: 13, fontWeight: 600, marginTop: 8 }}>{msg}</div>}
        </div>

        {err && <div role="alert" style={{ color: t.warn, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {list === null ? <div style={{ color: t.muted }}>Зареждане…</div> : list.length === 0 ? (
          <div style={{ color: t.muted, fontSize: 14 }}>Още няма измервания. Добави първото отгоре.</div>
        ) : (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
            {/* избор на мярка */}
            <div role="tablist" aria-label="Мярка" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {METRICS.filter((m) => counts[m.key] > 0).map((m) => (
                <button key={m.key} role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)} style={{
                  border: `1px solid ${metric === m.key ? t.tealDark : t.line}`, background: metric === m.key ? t.tealDark : "#fff",
                  color: metric === m.key ? "#fff" : t.ink, borderRadius: 20, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>{m.label} · {counts[m.key]}</button>
              ))}
            </div>

            {series.length === 0 ? <div style={{ color: t.muted, fontSize: 13 }}>Няма измервания на „{M.label}".</div> : (
              <>
                {tr ? (
                  <div style={{ fontSize: 13.5, color: t.ink }}>
                    {M.label}: <b>{round(tr.first.value, 1)} → {round(tr.last.value, 1)} {M.unit}</b>{" "}
                    (<b>{signed(tr.change)} {M.unit}</b> за {tr.days} {tr.days === 1 ? "ден" : "дни"}
                    {tr.perWeek != null ? <>, средно {signed(tr.perWeek, 2)} {M.unit}/седмица</> : ""})
                    <span style={{ color: t.muted }}> · от {fmtDate(tr.first.date)} до {fmtDate(tr.last.date)}</span>
                  </div>
                ) : <div style={{ fontSize: 13, color: t.muted }}>Едно измерване ({round(series[0].value, 1)} {M.unit} на {fmtDate(series[0].date)}). Тенденцията се показва от второто нататък.</div>}
                <LineChart series={series} unit={M.unit} label={`${M.label} (${M.unit})`} />
              </>
            )}

            {/* история = таблицата към графиката */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: t.tealDark, color: "#fff" }}>
                  <th style={th}>Дата</th>{METRICS.map((m) => <th key={m.key} style={th}>{m.label} ({m.unit})</th>)}<th style={th}></th>
                </tr></thead>
                <tbody>{list.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? t.tealPale : "#fff" }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{fmtDate(r.measured_on)}</td>
                    {METRICS.map((m) => <td key={m.key} style={{ ...td, color: r[m.key] == null ? t.muted : t.ink }}>{r[m.key] == null ? "—" : round(Number(r[m.key]), 1)}</td>)}
                    <td style={td}><button onClick={() => remove(r)} aria-label={`Изтрий измерването от ${fmtDate(r.measured_on)}`} style={{ border: "none", background: "none", color: t.muted, cursor: "pointer", fontSize: 15 }}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: t.muted }}>„—" значи, че мярката не е измерена на тази дата (не е нула). Изтриването на измерване не променя теглото в профила.</div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Нужни деления на оста: 4–6 „кръгли" стойности, които обхващат данните. */
function niceTicks(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || 10 * p;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const ticks = []; for (let v = start; v <= end + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Линейна графика на една мярка във времето: x по реални дати, една ос, подсказка при посочване. */
function LineChart({ series, unit, label }) {
  const wrap = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const H = 240, padL = 46, padR = 16, padT = 14, padB = 30;
  const xs = series.map((p) => Date.parse(p.date + "T00:00:00Z"));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const vals = series.map((p) => p.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = (ms) => (x1 === x0 ? (padL + (w - padR)) / 2 : padL + ((ms - x0) / (x1 - x0)) * (w - padL - padR));
  const Y = (v) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  const pts = series.map((p, i) => ({ ...p, x: X(xs[i]), y: Y(p.value) }));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  // етикети по x: първа и последна дата, плюс междинни, ако има място (≥ 90 px между тях)
  const xLabels = pts.filter((p, i) => i === 0 || i === pts.length - 1 || (pts.length > 2 && i % Math.ceil(pts.length / Math.max(1, Math.floor((w - padL - padR) / 90))) === 0));
  const shownX = xLabels.filter((p, i, a) => i === 0 || p.x - a[i - 1].x >= 60);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = 0; pts.forEach((p, i) => { if (Math.abs(p.x - mx) < Math.abs(pts[best].x - mx)) best = i; });
    setHover(best);
  };
  const hp = hover != null ? pts[hover] : null;

  return (
    <div ref={wrap} style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}>
      <svg width={w} height={H} role="img" aria-label={`${label}: ${series.length} измервания`} style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke={t.line} strokeWidth="1" />
            <text x={padL - 8} y={Y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill={t.muted}>{round(v, 1)}</text>
          </g>
        ))}
        {shownX.map((p) => <text key={p.date} x={p.x} y={H - 8} textAnchor="middle" fontSize="11" fill={t.muted}>{fmtShort(p.date)}</text>)}
        {hp && <line x1={hp.x} x2={hp.x} y1={padT} y2={H - padB} stroke={t.muted} strokeWidth="1" strokeDasharray="3 3" />}
        {pts.length > 1 && <path d={path} fill="none" stroke={t.tealDark} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => <circle key={p.date + i} cx={p.x} cy={p.y} r={hover === i ? 5.5 : 4} fill={t.tealDark} stroke="#fff" strokeWidth="2" />)}
        {/* последната стойност — пряк етикет */}
        {hover !== pts.length - 1 && <text x={Math.min(pts[pts.length - 1].x, w - padR)} y={pts[pts.length - 1].y - 10} textAnchor="end" fontSize="12" fontWeight="700" fill={t.ink}>{round(pts[pts.length - 1].value, 1)} {unit}</text>}
      </svg>
      {hp && (
        <div style={{ position: "absolute", left: Math.min(Math.max(hp.x - 70, 0), w - 140), top: Math.max(hp.y - 58, 0), width: 140, pointerEvents: "none",
          background: "#fff", border: `1px solid ${t.line}`, borderRadius: 8, padding: "6px 9px", boxShadow: "0 2px 8px rgba(14,48,47,0.12)", fontSize: 12.5, color: t.ink }}>
          <div style={{ color: t.muted }}>{fmtDate(hp.date)}</div>
          <div><b>{round(hp.value, 1)} {unit}</b>{hover > 0 && <span style={{ color: t.muted }}> ({signed(hp.value - pts[hover - 1].value)})</span>}</div>
        </div>
      )}
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(14,48,47,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 };
const th = { padding: "8px 10px", fontSize: 12, fontWeight: 700, textAlign: "center" };
const td = { padding: "8px 10px", borderBottom: `1px solid ${t.line}`, textAlign: "center" };
