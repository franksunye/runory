"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useI18n } from "@/i18n/locale-provider";

type LocaleLinkProps = ComponentProps<typeof Link> & {
  /** If true, the href is already locale-aware or external and should not be prefixed */
  skipLocalePrefix?: boolean;
};

/**
 * A Link wrapper that automatically prefixes the current locale to href.
 *
 * - `/product` → `/en/product` (or `/zh/product`)
 * - `/` → `/en` (or `/zh`)
 * - External URLs (`http://...`) are passed through unchanged
 *
 * Use this instead of `next/link` in all marketing/[locale] pages so that
 * internal links include the locale segment without manual construction.
 */
export function LocaleLink({ href, skipLocalePrefix, ...props }: LocaleLinkProps) {
  const { locale } = useI18n();

  let localizedHref = href;
  if (!skipLocalePrefix && typeof href === "string") {
    if (href.startsWith("http") || href.startsWith("mailto:")) {
      localizedHref = href;
    } else if (href === "/") {
      localizedHref = `/${locale}`;
    } else {
      localizedHref = `/${locale}${href}`;
    }
  }

  return <Link href={localizedHref} {...props} />;
}
