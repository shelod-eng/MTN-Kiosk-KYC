import Link from "next/link";
import { notFound } from "next/navigation";
import { SecureSessionClient } from "@/components/secure-session-client";
import { getCaseBySessionToken } from "@/lib/whatsapp-store";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function VerifySessionPage({ params }: PageProps) {
  const { token } = await params;
  const kycCase = await getCaseBySessionToken(token);

  if (!kycCase) {
    notFound();
  }

  return (
    <>
      <div className="border-b border-[#dde7ef] bg-white px-4 py-3 text-sm text-[#62798f] lg:px-8">
        <Link href="/" className="font-medium text-[#214562]">
          Back to workbench
        </Link>
      </div>
      <SecureSessionClient kycCase={kycCase} token={token} />
    </>
  );
}
