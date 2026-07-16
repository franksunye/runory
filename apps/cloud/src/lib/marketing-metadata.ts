import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://runory.vercel.app";

type MarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

export function buildMarketingMetadata({ title, description, path, keywords = [] }: MarketingMetadataInput): Metadata {
  const canonical = `${siteUrl}${path}`;
  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Runory",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
