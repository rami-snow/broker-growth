import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Page top bar (Figma: 56px, title left, actions right). Optional intro text renders below it. */
export function PageTitle({ eyebrow, title, body, action, breadcrumb }: { eyebrow?: string; title: string; body?: string; action?: ReactNode; breadcrumb?: { href: string; label: string } }) {
  return <>
    <header className="page-topbar">
      <div className="page-topbar__title">
        {breadcrumb && <><Link href={breadcrumb.href} className="page-topbar__crumb">{breadcrumb.label}</Link><ChevronRight aria-hidden className="page-topbar__sep"/></>}
        <h1>{title}</h1>
      </div>
      {action && <div className="page-topbar__actions">{action}</div>}
    </header>
    {(eyebrow || body) && <div className="page-intro">{eyebrow && <p className="eyebrow">{eyebrow}</p>}{body && <p>{body}</p>}</div>}
  </>;
}
