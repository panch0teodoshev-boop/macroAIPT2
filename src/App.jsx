import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/Auth.jsx";
import { t, FONT } from "./ui/theme.js";
import { Button, Card } from "./ui/primitives.jsx";
import { useViewport } from "./ui/useViewport.js";
import Login from "./screens/Login.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Clients from "./screens/Clients.jsx";
import Calculator from "./screens/Calculator.jsx";
import Foods from "./screens/Foods.jsx";
import Planner from "./screens/Planner.jsx";
import AIAssistant from "./screens/AIAssistant.jsx";
import Admin from "./screens/Admin.jsx";

const NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clients", label: "Моите клиенти" },
  { id: "calculator", label: "Хранителен калкулатор" },
  { id: "planner", label: "Седмичен дневник" },
  { id: "foods", label: "База и рецепти" },
  { id: "ai", label: "AI асистент" },
  { id: "settings", label: "Настройки" },
];

function Shell() {
  const { profile, loading, session, signOut } = useAuth();
  const { isDesktop } = useViewport();
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return <Center>Зареждане…</Center>;
  if (!session) return <Login />;
  if (!profile) return <Center>
    <Card style={{ maxWidth: 420, textAlign: "center" }}>
      <div style={{ color: t.ink, fontWeight: 700, marginBottom: 6 }}>Няма профил за този акаунт</div>
      <div style={{ color: t.muted, fontSize: 14, marginBottom: 12 }}>Акаунтът съществува в Auth, но няма ред в „profiles". Админът трябва да създаде профил.</div>
      <Button variant="ghost" onClick={signOut}>Изход</Button>
    </Card>
  </Center>;
  if (profile.status !== "active") return <Center>
    <Card style={{ maxWidth: 420, textAlign: "center" }}>
      <div style={{ color: t.warn, fontWeight: 700, marginBottom: 6 }}>Профилът не е активен</div>
      <div style={{ color: t.muted, fontSize: 14, marginBottom: 12 }}>Статус: {profile.status}. Свържи се с администратора.</div>
      <Button variant="ghost" onClick={signOut}>Изход</Button>
    </Card>
  </Center>;

  const nav = profile.role === "super_admin" ? [{ id: "admin", label: "Админ панел" }, ...NAV] : NAV;
  const goto = (id) => { setView(id); setMenuOpen(false); };

  const SidebarInner = (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 18 }}>PulseMacro <span style={{ color: t.coral }}>Pro</span></div>
      <nav style={{ display: "grid", gap: 4, flex: 1 }}>
        {nav.map((it) => (
          <button key={it.id} onClick={() => goto(it.id)} style={{
            textAlign: "left", border: "none", cursor: "pointer", borderRadius: 9, padding: "11px 12px",
            fontFamily: FONT, fontSize: 14.5, fontWeight: view === it.id ? 700 : 500,
            background: view === it.id ? "rgba(255,255,255,0.14)" : "transparent",
            color: view === it.id ? "#fff" : "rgba(255,255,255,0.8)",
          }}>{it.label}</button>
        ))}
      </nav>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 12, marginTop: 12, fontSize: 12.5 }}>
        <div style={{ opacity: 0.85, marginBottom: 8, wordBreak: "break-word" }}>{profile.full_name || profile.email}</div>
        <button onClick={signOut} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: FONT, fontSize: 12.5 }}>Изход</button>
      </div>
    </>
  );

  const content = (
    <main style={{ padding: isDesktop ? 24 : 16, overflow: "auto" }}>
      {view === "dashboard" && <Dashboard profile={profile} go={goto} />}
      {view === "clients" && <Clients onOpen={() => goto("calculator")} />}
      {view === "calculator" && <Calculator />}
      {view === "admin" && <Admin />}
      {view === "planner" && <Planner />}
      {view === "foods" && <Foods />}
      {view === "ai" && <AIAssistant />}
      {view === "settings" && <Placeholder title="Настройки" text="Профил, език, GDPR експорт/изтриване — следващ етап." />}
    </main>
  );

  // DESKTOP: фиксиран sidebar | 1fr
  if (isDesktop) {
    return (
      <div style={{ fontFamily: FONT, background: t.bg, minHeight: "100vh", display: "grid", gridTemplateColumns: "230px 1fr" }}>
        <aside style={{ background: t.tealDark, color: "#fff", padding: "18px 14px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          {SidebarInner}
        </aside>
        {content}
      </div>
    );
  }

  // MOBILE / TABLET: горна лента + чекмедже
  return (
    <div style={{ fontFamily: FONT, background: t.bg, minHeight: "100vh" }}>
      <header style={{ background: t.tealDark, color: "#fff", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", position: "sticky", top: 0, zIndex: 40 }}>
        <button onClick={() => setMenuOpen(true)} aria-label="Меню" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", width: 38, height: 38, borderRadius: 9, cursor: "pointer", fontSize: 18 }}>☰</button>
        <div style={{ fontSize: 17, fontWeight: 800 }}>PulseMacro <span style={{ color: t.coral }}>Pro</span></div>
        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600 }}>{nav.find((x) => x.id === view)?.label}</div>
      </header>

      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(14,48,47,0.5)", zIndex: 50 }}>
          <aside onClick={(e) => e.stopPropagation()} style={{ background: t.tealDark, color: "#fff", width: 250, maxWidth: "80vw", height: "100%", padding: "18px 14px", display: "flex", flexDirection: "column" }}>
            {SidebarInner}
          </aside>
        </div>
      )}

      {content}
    </div>
  );
}

function Placeholder({ title, text }) {
  return <div><h2 style={{ color: t.ink, marginTop: 0 }}>{title}</h2><Card style={{ color: t.muted }}>{text}</Card></div>;
}
function Center({ children }) {
  return <div style={{ fontFamily: FONT, minHeight: "100vh", background: t.bg, display: "grid", placeItems: "center", color: t.muted, padding: 20 }}>{children}</div>;
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}
