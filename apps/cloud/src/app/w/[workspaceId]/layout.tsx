"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NavigationShell from "@/components/NavigationShell";
import type { NavigationItem } from "@runory/platform-core";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const [navigation, setNavigation] = useState<NavigationItem[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [wsRes, navRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}`),
          fetch(`/api/workspaces/${workspaceId}/navigation`),
        ]);
        const wsJson = await wsRes.json();
        const navJson = await navRes.json();
        if (!active) return;
        if (wsJson.success) setWorkspaceName(wsJson.data.name);
        if (navJson.success) setNavigation(navJson.data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceId]);

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
      workspaceId={workspaceId}
      workspaceName={workspaceName}
    >
      {children}
    </NavigationShell>
  );
}
