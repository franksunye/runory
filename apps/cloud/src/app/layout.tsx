import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/locale-provider";
import { SWRProvider } from "@/lib/swr-provider";

export const metadata: Metadata = {
  title: "Runory | Composable Agent-native Business Runtime",
  description: "Start with one Workspace, install capabilities as needed, and adapt your business through a governed Agent.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  manifest: "/m/manifest.json",
  openGraph: {
    title: "Runory | Tell it. Run it.",
    description: "A composable, Cloud-first and Agent-native business runtime.",
    type: "website",
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
      <body><LocaleProvider initialLocale={locale}><SWRProvider>{children}</SWRProvider></LocaleProvider></body>
    </html>
  );
}
