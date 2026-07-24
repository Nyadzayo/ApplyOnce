import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installPanelErrorHandlers, track } from "./telemetry";
import "./sidepanel.css";

installPanelErrorHandlers();
track("panel_opened", { surface: "sidepanel" });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
