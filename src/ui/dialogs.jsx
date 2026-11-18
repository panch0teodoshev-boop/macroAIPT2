// Собствени диалози вместо window.alert / confirm / prompt.
// Използване: if (!(await confirmDialog({ title, message, confirmLabel, danger: true }))) return;
//             const name = await promptDialog({ title, label, defaultValue }); // null при отказ
//             await alertDialog({ title, message });
// <DialogHost /> е монтиран веднъж в main.jsx — извън App, така че смяна на десктоп/мобилен изглед не го затваря.
import React, { useEffect, useRef, useState } from "react";
import { t, FONT } from "./theme.js";
import { Button, Input } from "./primitives.jsx";
import { attachHost } from "./dialogApi.js";

export { confirmDialog, promptDialog, alertDialog } from "./dialogApi.js";

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => attachHost(setQueue), []);
  const d = queue[0];
  if (!d) return null;
  const close = (value) => { setQueue((q) => q.slice(1)); d.resolve(value); };
  return <Dialog key={queue.length + (d.title || "") + (d.message || "")} d={d} close={close} />;
}

function Dialog({ d, close }) {
  const [text, setText] = useState(d.defaultValue ?? "");
  const inputRef = useRef(null), okRef = useRef(null);
  const cancelValue = d.kind === "prompt" ? null : d.kind === "alert" ? undefined : false;
  const trimmed = text.trim();
  const canOk = d.kind !== "prompt" || (trimmed.length > 0 || d.allowEmpty);
  const ok = () => {
    if (!canOk) return;
    close(d.kind === "prompt" ? trimmed.slice(0, d.maxLength || 200) : d.kind === "alert" ? undefined : true);
  };
  useEffect(() => {
    (d.kind === "prompt" ? inputRef.current : okRef.current)?.focus();
    if (d.kind === "prompt") inputRef.current?.select();
  }, [d]);
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(cancelValue); }
    if (e.key === "Enter" && d.kind === "prompt") { e.preventDefault(); ok(); }
  };
  const titleId = "dlg-title", msgId = "dlg-msg";
  return (
    <div onKeyDown={onKey} onClick={() => close(cancelValue)}
      style={{ position: "fixed", inset: 0, background: "rgba(14,48,47,0.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 100, fontFamily: FONT }}>
      <div role={d.kind === "prompt" ? "dialog" : "alertdialog"} aria-modal="true" aria-labelledby={titleId} aria-describedby={d.message ? msgId : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, boxShadow: "0 18px 50px rgba(14,48,47,0.28)", width: "100%", maxWidth: 420, padding: 20 }}>
        <h3 id={titleId} style={{ margin: "0 0 8px", fontSize: 17, color: t.ink }}>{d.title || (d.kind === "alert" ? "Внимание" : d.kind === "prompt" ? "Въведи" : "Потвърждение")}</h3>
        {d.message && <div id={msgId} style={{ fontSize: 14, color: t.ink, lineHeight: 1.5, whiteSpace: "pre-line", marginBottom: 14 }}>{d.message}</div>}
        {d.kind === "prompt" && (
          <label style={{ display: "block", marginBottom: 14 }}>
            {d.label && <div style={{ fontSize: 12.5, fontWeight: 700, color: t.muted, marginBottom: 5 }}>{d.label}</div>}
            <Input ref={inputRef} value={text} maxLength={d.maxLength || 200} onChange={(e) => setText(e.target.value)} aria-label={d.label || d.title} />
          </label>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {d.kind !== "alert" && <Button variant="ghost" onClick={() => close(cancelValue)}>{d.cancelLabel || "Отказ"}</Button>}
          <Button ref={okRef} variant="teal" disabled={!canOk} onClick={ok}
            style={{ ...(d.danger ? { background: t.warn } : null), ...(!canOk ? { opacity: 0.5, cursor: "not-allowed" } : null) }}>
            {d.confirmLabel || (d.kind === "alert" ? "Добре" : d.kind === "prompt" ? "Запази" : "Да")}
          </Button>
        </div>
      </div>
    </div>
  );
}
