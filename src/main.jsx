import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { DialogHost } from "./ui/dialogs.jsx";
createRoot(document.getElementById("root")).render(<React.StrictMode><App /><DialogHost /></React.StrictMode>);
