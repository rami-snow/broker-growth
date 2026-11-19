import { FutureScreen } from "@/features/future/future-screen";
import { RuntimePage } from "@/components/runtime-page";
export default function Page() { return <RuntimePage returnPath="/reports" fixture={<FutureScreen title="Reports" body="Operational reporting beyond Today metrics belongs to a later milestone."/>}/>; }
