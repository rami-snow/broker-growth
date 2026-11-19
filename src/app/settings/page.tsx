import { SettingsScreen } from "@/features/settings/settings-screen";
import { RuntimePage } from "@/components/runtime-page";
export default function Page() { return <RuntimePage returnPath="/settings" fixture={<SettingsScreen/>}/>; }
