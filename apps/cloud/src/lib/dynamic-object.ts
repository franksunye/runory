"use client";

import { useNavigation } from "./api-hooks";
import type { NavigationItem } from "@runory/platform-core";

/**
 * Convert a URL segment to an objectKey.
 * "service-sites" → "service_site", "companies" → "company", "tickets" → "ticket"
 */
export function segmentToObjectKey(segment: string): string {
  const parts = segment.split("-");
  const last = parts[parts.length - 1] ?? segment;
  let singular = last;
  if (last.endsWith("ies")) {
    singular = `${last.slice(0, -3)}y`; // companies → company
  } else if (last.endsWith("ses")) {
    singular = last.slice(0, -2); // statuses → status
  } else if (last.endsWith("s")) {
    singular = last.slice(0, -1); // reports → report, sites → site
  }
  return [...parts.slice(0, -1), singular].join("_");
}

function pluralizeRouteToken(token: string): string {
  if (token.endsWith("y")) return `${token.slice(0, -1)}ies`;
  if (token.endsWith("s")) return `${token}es`;
  return `${token}s`;
}

/**
 * Convert an objectKey to the canonical dynamic route segment.
 * "service_site" → "service-sites", "company" → "companies"
 */
export function objectKeyToRouteSegment(objectKey: string): string {
  const parts = objectKey.split("_");
  const last = parts[parts.length - 1] ?? objectKey;
  return [...parts.slice(0, -1), pluralizeRouteToken(last)].join("-");
}

/**
 * Convert an objectKey to a human-readable English title (fallback).
 * "service_site" → "Service Site"
 */
export function objectKeyToTitle(objectKey: string): string {
  return objectKey
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve a localized label for a dynamic object route.
 * Looks up the navigation item matching the route segment and returns
 * its label (e.g., "工单" for /tickets). Falls back to a capitalized
 * English title derived from the objectKey.
 */
export function useObjectLabel(
  workspaceId: string,
  routeSegment: string
): string {
  const { data: navigation } = useNavigation(workspaceId);
  const navigationItems: NavigationItem[] = navigation?.items ?? [];
  const navItem = navigationItems.find((n) => n.route === `/${routeSegment}`);
  const objectKey = segmentToObjectKey(routeSegment);
  return navItem?.label ?? objectKeyToTitle(objectKey);
}
