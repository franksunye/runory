import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/locale-provider";
import { SWRProvider } from "@/lib/swr-provider";
import PersonaSwitcher from "@/components/PersonaSwitcher";

export const metadata: Metadata = {
  title: "Runory | Field Service Operating System for the Agent Era",
  description: "Runory unifies CRM, Sales, Voice Intake, and field service operations in one adaptive, governed operating system for service businesses.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  manifest: "/m/manifest.json",
  openGraph: {
    title: "Runory | Field Service Operating System for the Agent Era",
    description: "CRM, Sales, Voice Intake, and FSM in one adaptive operating system, designed to work with external Super Agents.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Runory | Field Service Operating System for the Agent Era",
    description: "CRM, Sales, Voice Intake, and FSM in one adaptive operating system for service businesses.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE);

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <SWRProvider>
            {children}
            <PersonaSwitcher />
          </SWRProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
