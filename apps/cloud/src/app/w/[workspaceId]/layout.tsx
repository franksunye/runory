"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import NavigationShell from "@/components/NavigationShell";
import EarlyAccessBanner from "@/components/EarlyAccessBanner";
import { WORKSPACE_NAVIGATION_CHANGED } from "@/lib/workspace-events";
import type { NavigationItem } from "@runory/platform-core";

interface InstalledPackGroup {
  packId: string;
  packName: string;
  category: string;
  installedAt: string;
}

interface NavigationApiResponse {
  items: NavigationItem[];
  packs: InstalledPackGroup[];
  modulePackMap: Record<string, string>;
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const workspaceRef = params.workspaceId as string;
  const pathname = usePathname();
  const router = useRouter();
  const [navigation, setNavigation] = useState<NavigationItem[]>([]);
  const [packs, setPacks] = useState<InstalledPackGroup[]>([]);
  const [modulePackMap, setModulePackMap] = useState<Record<string, string>>({});
  const [workspaceName, setWorkspaceName] = useState("");
  const [organizationRole, setOrganizationRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadWorkspaceShell = useCallback(async () => {
    try {
      setError(undefined);
      const [wsRes, navRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceRef}`),
        fetch(`/api/workspaces/${workspaceRef}/navigation`),
      ]);
      const wsJson = await wsRes.json();
      const navJson = await navRes.json();
      if (wsJson.success) {
        setWorkspaceName(wsJson.data.name);
        setOrganizationRole(wsJson.data.organizationRole ?? undefined);
        if (workspaceRef !== wsJson.data.slug) {
          const prefix = `/w/${workspaceRef}`;
          router.replace(`/w/${wsJson.data.slug}${pathname.slice(prefix.length)}`);
        }
      }
      if (navJson.success) {
        // v0.3.0: navigation API returns { items, packs, modulePackMap }
        const data = navJson.data as NavigationApiResponse;
        if (data.items && Array.isArray(data.items)) {
          setNavigation(data.items);
          setPacks(data.packs ?? []);
          setModulePackMap(data.modulePackMap ?? {});
        } else {
          // Backward compat: old API returned flat array
          setNavigation(data as unknown as NavigationItem[]);
          setPacks([]);
          setModulePackMap({});
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载工作区失败");
    } finally {
      setLoading(false);
    }
  }, [pathname, router, workspaceRef]);

  useEffect(() => {
    void loadWorkspaceShell();
    const refreshNavigation = () => { void loadWorkspaceShell(); };
    window.addEventListener(WORKSPACE_NAVIGATION_CHANGED, refreshNavigation);
    return () => {
      window.removeEventListener(WORKSPACE_NAVIGATION_CHANGED, refreshNavigation);
    };
  }, [loadWorkspaceShell]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-400">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button
            onClick={() => { setLoading(true); void loadWorkspaceShell(); }}
            className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <NavigationShell
      navigation={navigation}
      packs={packs}
      modulePackMap={modulePackMap}
      workspaceId={workspaceRef}
      workspaceName={workspaceName}
      role={organizationRole}
    >
      <EarlyAccessBanner />
      {children}
    </NavigationShell>
  );
}
