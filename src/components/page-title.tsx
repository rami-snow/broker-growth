import type { ReactNode } from "react";
export function PageTitle({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body: string; action?: ReactNode }) { return <div className="page-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{body}</p></div>{action}</div>; }
