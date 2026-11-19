import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PrototypeProvider } from "@/components/prototype-provider";
import { getRuntimeMode } from "@/platform/runtime/config";

export const metadata: Metadata = { title: "Broker Growth Desk", description: "Brokerage growth and retention prototype" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const content = getRuntimeMode() === "fixture" ? <PrototypeProvider><AppShell>{children}</AppShell></PrototypeProvider> : children; return <html lang="en-AU"><body>{content}</body></html>; }
