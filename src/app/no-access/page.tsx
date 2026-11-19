import { signOut } from "@/app/auth-actions";
import { Button } from "@/components/ui";

export default function NoAccessPage() { return <main className="auth-shell"><section className="auth-card"><span className="auth-mark">BG</span><h1>Brokerage access unavailable</h1><p>The selected brokerage is not one of your active memberships. Choose another valid organisation or ask a controlled administrator for access.</p><form action={signOut}><Button type="submit" variant="secondary">Sign out</Button></form></section></main>; }
