import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/locale-provider";
import { SWRProvider } from "@/lib/swr-provider";
import PersonaSwitcher from "@/components/PersonaSwitcher";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runory.vercel.app";

export const metadata: Metadata = {
  title: { default: "Runory | Agent-native Operating System for Service Businesses", template: "%s | Runory" },
  description:
    "Runory is an Agent-native business operating system for SME service businesses, combining CRM, Sales, Voice Intake, and FSM in one governed runtime.",
  keywords: [
    "Agent-native software",
    "SME operating system",
    "field service management",
    "FSM software",
    "voice intake",
    "CRM for service businesses",
    "AI agent business software",
    "service operations platform",
  ],
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  manifest: "/m/manifest.json",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    title: "Runory | Agent-native Operating System for Service Businesses",
    description:
      "CRM, Sales, Voice Intake, and FSM unified in one governed runtime, designed to work with external Super Agents.",
    type: "website",
    url: siteUrl,
    siteName: "Runory",
  },
  twitter: {
    card: "summary_large_image",
    title: "Runory | Agent-native Operating System for Service Businesses",
    description:
      "Connect customer conversations, business workflows, and external Agents in one governed operating system.",
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
      description:
        "An Agent-native business operating system that unifies CRM, Sales, Voice Intake, and FSM with governed execution.",
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
