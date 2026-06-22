"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import NavigationShell from "@/components/NavigationShell";
import { WORKSPACE_NAVIGATION_CHANGED } from "@/lib/workspace-events";
import type { NavigationItem } from "@runory/platform-core";

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
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadWorkspaceShell = useCallback(async () => {
    try {
      const [wsRes, navRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceRef}`),
        fetch(`/api/workspaces/${workspaceRef}/navigation`),
      ]);
      const wsJson = await wsRes.json();
      const navJson = await navRes.json();
      if (wsJson.success) {
        setWorkspaceName(wsJson.data.name);
        if (workspaceRef !== wsJson.data.slug) {
          const prefix = `/w/${workspaceRef}`;
          router.replace(`/w/${wsJson.data.slug}${pathname.slice(prefix.length)}`);
        }
      }
      if (navJson.success) setNavigation(navJson.data);
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

  return (
    <NavigationShell
      navigation={navigation}
      workspaceId={workspaceRef}
      workspaceName={workspaceName}
    >
      {children}
    </NavigationShell>
  );
}
