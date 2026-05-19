import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiosk - KYC",
  description: "Functional kiosk and WhatsApp KYC prototype for South African onboarding flows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
