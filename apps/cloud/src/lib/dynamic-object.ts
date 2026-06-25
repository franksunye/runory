"use client";

import { useNavigation } from "./api-hooks";
import type { NavigationItem } from "@runory/platform-core";
import { segmentToObjectKey, objectKeyToTitle } from "./route-conversion";

// Re-export pure functions from route-conversion.ts (non-client module)
// so existing imports from dynamic-object.ts continue to work.
export { segmentToObjectKey, objectKeyToRouteSegment, objectKeyToTitle } from "./route-conversion";

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
