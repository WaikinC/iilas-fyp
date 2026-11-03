import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "../app/dispatch.css";
import "../app/dashboard.css";
import "../app/products.css";
import "../app/improvements.css";
import "./features/stock/stock.css";
import "./features/warehouse/warehouse.css";
import './features/operations/operations.css';
import '../app/interface.css';

const root=createRoot(document.getElementById("root")!);
void import('../app/page').then(({default:Home})=>root.render(<StrictMode><Home/></StrictMode>)).catch(()=>{
  root.render(<main style={{maxWidth:640,width:'calc(100% - 32px)',margin:'64px auto',padding:24}} role="alert"><h1>IILAS could not start</h1><p>Reload the app. If it still cannot open, check its demo environment configuration.</p><button className="primary navy" onClick={()=>window.location.reload()}>Reload app</button></main>);
});
