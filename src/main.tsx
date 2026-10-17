import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "../app/dispatch.css";
import "../app/dashboard.css";
import "../app/products.css";
import "../app/improvements.css";
import "./features/stock/stock.css";
import "./features/warehouse/warehouse.css";
import './features/operations/operations.css';
import '../app/interface.css';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
