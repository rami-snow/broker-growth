import type { ReactNode } from "react";

/**
 * The single development notice. Shown in fixture mode, and in Supabase mode outside production builds.
 * It replaces the scattered prototype notes so the app never implies fixture state or switchers are secure.
 */
export function EnvironmentRibbon({ mode, children }: { mode: "fixture" | "development"; children?: ReactNode }) {
  return <div className="env-ribbon" role="note" aria-label="Environment">
    <strong>{mode === "fixture" ? "Fixture mode" : "Development"}</strong>
    <span>{mode === "fixture" ? "Fictional data. Resets on reload. Switchers simulate sign-in and are not secure." : "Fictional data in the development database. Not a production environment."}</span>
    {children && <span className="env-ribbon__controls">{children}</span>}
  </div>;
}

export const showDevelopmentRibbon = () => process.env.NODE_ENV !== "production";
