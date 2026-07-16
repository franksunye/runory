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
    "/resources/agent-native-field-service",
    "/resources/voice-intake-to-work-order",
    "/resources/focused-fsm-pilot",
    "/resources/external-super-agents",
    "/resources/crm-sales-fsm-operating-loop",
    "/resources/fsm-pilot-playbook",
    "/docs",
    "/packs",
    "/open-source",
    "/security",
  ];

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route.startsWith("/resources/") ? "monthly" : "weekly",
    priority: route === "" ? 1 : route === "/pilot" ? 0.9 : route.startsWith("/solutions/") ? 0.8 : 0.7,
  }));
}
