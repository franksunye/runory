import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://runory.vercel.app";
  const routes = [
    "",
    "/product",
    "/solutions",
    "/solutions/home-services",
    "/solutions/hvac",
    "/solutions/waterproofing",
    "/voice",
    "/agent",
    "/platform",
    "/pricing",
    "/pilot",
    "/resources",
    "/resources/vibe-coding-to-governed-business-systems",
    "/resources/agent-token-efficiency",
    "/resources/governed-agent-runtime",
    "/resources/runory-agent-architecture",
    "/resources/claude-code-vs-runory",
    "/resources/enterprise-ai-system-of-record",
    "/resources/configuration-before-code",
    "/resources/ai-software-productionization-gap",
    "/resources/agent-native-field-service",
    "/resources/voice-intake-to-work-order",
    "/resources/focused-fsm-pilot",
    "/resources/external-agents-for-sme-software",
    "/resources/crm-sales-fsm-operating-loop",
    "/resources/fsm-pilot-in-1-2-weeks",
    "/docs",
    "/packs",
    "/open-source",
    "/security",
  ];

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route.startsWith("/resources/") ? "monthly" : "weekly",
    priority: route === "" ? 1 : route === "/pilot" ? 0.9 : route.startsWith("/solutions/") ? 0.8 : route.startsWith("/resources/") ? 0.75 : 0.7,
  }));
}
