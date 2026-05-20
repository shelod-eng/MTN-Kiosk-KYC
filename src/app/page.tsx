import { WhatsAppOpsConsole } from "@/components/whatsapp-ops-console";
import { KycWorkbench } from "@/components/kyc-workbench";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
      <WhatsAppOpsConsole />
      <KycWorkbench />
    </div>
  );
}
