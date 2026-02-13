import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SharkPro - Atendimento ao Cliente com IA",
  description:
    "Plataforma SaaS de automação inteligente para WhatsApp. Atendimento ao cliente com IA, gestão de leads e métricas de vendas.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={inter.className}>
        <ImpersonationBanner />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
