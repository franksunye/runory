"use client";

import { useNavigation } from "./api-hooks";

/**
 * Convert a URL segment to an objectKey.
 * "service-sites" → "service_site", "companies" → "company", "tickets" → "ticket"
 */
export function segmentToObjectKey(segment: string): string {
  let singular: string;
  if (segment.endsWith("ies")) {
    singular = segment.slice(0, -3) + "y"; // companies → company
  } else if (segment.endsWith("es") && !segment.endsWith("ses")) {
    singular = segment.slice(0, -2); // boxes → box
  } else if (segment.endsWith("s")) {
    singular = segment.slice(0, -1); // tickets → ticket
  } else {
    singular = segment;
  }
  return singular.replace(/-/g, "_");
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
  const { data: navigation = [] } = useNavigation(workspaceId);
  const navItem = navigation.find((n) => n.route === `/${routeSegment}`);
  const objectKey = segmentToObjectKey(routeSegment);
  return navItem?.label ?? objectKeyToTitle(objectKey);
}
