import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/locale-provider";

/**
 * Pre-render all supported locales at build time so marketing pages are
 * served as static HTML from the CDN (zero SSR CPU cost).
 */
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params.locale as Locale;
  if (!SUPPORTED_LOCALES.includes(locale)) notFound();

  // This LocaleProvider shadows the root layout's provider (which uses
  // DEFAULT_LOCALE). Components inside [locale] routes see the URL-based
  // locale, enabling fully static rendering without cookies().
  return <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>;
}
