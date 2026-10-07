import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"IILAS | Inventory & Logistics",description:"Product management and shipment dispatch prototype.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}

