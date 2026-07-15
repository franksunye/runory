import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/locale-provider";
import { SWRProvider } from "@/lib/swr-provider";
import PersonaSwitcher from "@/components/PersonaSwitcher";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runory.vercel.app";

export const metadata: Metadata = {
  title: { default: "Runory | Field Service Operating System for the Agent Era", template: "%s | Runory" },
  description: "Runory unifies CRM, Sales, Voice Intake, and field service operations in one adaptive, governed operating system for service businesses.",
  keywords: ["field service management", "FSM software", "Agent-native software", "voice intake", "CRM for service businesses", "field service operating system", "AI agent business software"],
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  manifest: "/m/manifest.json",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    title: "Runory | Field Service Operating System for the Agent Era",
    description: "CRM, Sales, Voice Intake, and FSM in one adaptive operating system, designed to work with external Super Agents.",
    type: "website",
    url: siteUrl,
    siteName: "Runory",
  },
  twitter: {
    card: "summary_large_image",
    title: "Runory | Field Service Operating System for the Agent Era",
    description: "CRM, Sales, Voice Intake, and FSM in one adaptive operating system for service businesses.",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Runory",
      url: siteUrl,
      sameAs: ["https://github.com/franksunye/runory"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "Runory",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description: "An Agent-native field service operating system that unifies CRM, Sales, Voice Intake, and FSM with governed execution.",
      featureList: ["CRM", "Sales", "Voice and messaging intake", "Field service management", "Agent interface", "Governed commands", "Audit"],
      publisher: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE);

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
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
