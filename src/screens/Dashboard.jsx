import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { t } from "../ui/theme.js";
import { Card, Button, Stat } from "../ui/primitives.jsx";

export default function Dashboard({ profile, go }) {
  const [clients, setClients] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("archived", false)
      .then(({ count }) => setClients(count ?? 0));
    supabase.from("clients").select("id, first_name, last_name, created_at").order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecent(data || []));
  }, []);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0, color: t.ink }}>Здравей, {profile?.full_name || "колега"} 👋</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat label="Активни клиенти" value={clients ?? "…"} accent={t.coral} />
        <Stat label="Роля" value={profile?.role === "super_admin" ? "Админ" : "Нутриционист"} />
        <Stat label="Статус" value={profile?.status === "active" ? "Активен" : profile?.status} accent={t.good} />
      </div>

      <Card>
        <div style={{ fontWeight: 700, color: t.ink, marginBottom: 10 }}>Бързи действия</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button onClick={() => go("clients")}>Нов клиент</Button>
          <Button variant="teal" onClick={() => go("calculator")}>Отвори калкулатор</Button>
          <Button variant="ghost" onClick={() => go("planner")}>Нов режим</Button>
          <Button variant="ghost" onClick={() => go("ai")}>AI асистент</Button>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, color: t.ink, marginBottom: 10 }}>Последно добавени клиенти</div>
        {recent.length === 0 ? <div style={{ color: t.muted, fontSize: 14 }}>Няма записи още.</div> : (
          <ul style={{ margin: 0, paddingLeft: 18, color: t.ink }}>
            {recent.map((c) => <li key={c.id} style={{ padding: "3px 0" }}>{c.first_name} {c.last_name || ""}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
