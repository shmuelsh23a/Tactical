import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
// Note: no StrictMode — the engine is an imperative, mutable singleton, and
// StrictMode's intentional double-invocation of render would re-run setup.
createRoot(root).render(<App />);
