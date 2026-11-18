// Показва отговор на AI с форматиране. Само React елементи — без вмъкване на HTML.
import React from "react";
import { t } from "./theme.js";
import { parseMarkdown } from "../lib/markdown.mjs";

function Inline({ nodes }) {
  return nodes.map((n, i) => {
    if (n.t === "b") return <strong key={i}><Inline nodes={n.c} /></strong>;
    if (n.t === "i") return <em key={i}><Inline nodes={n.c} /></em>;
    if (n.t === "code") return <code key={i} style={{ background: t.tealPale, borderRadius: 4, padding: "0 4px", fontSize: "0.92em" }}>{n.v}</code>;
    return <React.Fragment key={i}>{n.v}</React.Fragment>;
  });
}
const H = { 1: 18, 2: 16, 3: 15, 4: 14, 5: 14, 6: 14 };

export default function Markdown({ text }) {
  const blocks = parseMarkdown(text);
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {blocks.map((b, i) => {
        if (b.t === "h") { const Tag = `h${Math.min(6, b.level + 2)}`; return <Tag key={i} style={{ margin: i ? "6px 0 0" : 0, fontSize: H[b.level], fontWeight: 800, color: t.tealDark, lineHeight: 1.3 }}><Inline nodes={b.c} /></Tag>; }
        if (b.t === "hr") return <hr key={i} style={{ border: "none", borderTop: `1px solid ${t.line}`, margin: "2px 0", width: "100%" }} />;
        if (b.t === "p") return <p key={i} style={{ margin: 0 }}>{b.lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}<Inline nodes={l} /></React.Fragment>)}</p>;
        if (b.t === "ul" || b.t === "ol") {
          const Tag = b.t;
          return <Tag key={i} start={b.t === "ol" ? b.start : undefined} style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 3 }}>
            {b.items.map((it, j) => <li key={j} style={it.sub ? { marginLeft: 16, listStyleType: "circle" } : undefined}><Inline nodes={it.c} /></li>)}
          </Tag>;
        }
        if (b.t === "table") return (
          <div key={i} style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: "60%" }}>
              <thead><tr>{b.head.map((c, j) => <th key={j} style={{ textAlign: "left", padding: "5px 10px", background: t.tealPale, color: t.tealDark, borderBottom: `1px solid ${t.line}` }}><Inline nodes={c} /></th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={{ padding: "5px 10px", borderBottom: `1px solid ${t.line}` }}><Inline nodes={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        if (b.t === "quote") return <blockquote key={i} style={{ margin: 0, padding: "4px 10px", borderLeft: `3px solid ${t.tealLight}`, color: t.muted }}>{b.lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}<Inline nodes={l} /></React.Fragment>)}</blockquote>;
        if (b.t === "pre") return <pre key={i} style={{ margin: 0, padding: "8px 10px", background: t.tealPale, borderRadius: 8, overflowX: "auto", fontSize: 12.5, whiteSpace: "pre-wrap" }}>{b.v}</pre>;
        return null;
      })}
    </div>
  );
}
