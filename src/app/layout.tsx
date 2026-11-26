import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PrototypeProvider } from "@/components/prototype-provider";
import { getRuntimeMode } from "@/platform/runtime/config";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = { title: "Broker Growth Desk", description: "Brokerage growth and retention workspace" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const content = getRuntimeMode() === "fixture" ? <PrototypeProvider><AppShell>{children}</AppShell></PrototypeProvider> : children; return <html lang="en-AU" className={`${geistSans.variable} ${geistMono.variable}`}><body>{content}</body></html>; }
