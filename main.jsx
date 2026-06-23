import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installStorage } from "./storage.js";

// Локално съхранение (localStorage) за реалния сайт
installStorage();

// По избор: прокси за AI заявки (с API ключ зад него).
// Задава се чрез .env: VITE_AI_PROXY_URL=https://твоя-прокси
if (import.meta.env.VITE_AI_PROXY_URL) {
  window.__AI_ENDPOINT__ = import.meta.env.VITE_AI_PROXY_URL;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
