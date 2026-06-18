"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavigationItem } from "@/lib/metadata";

interface NavigationShellProps {
  navigation: NavigationItem[];
  workspaceId: string;
  workspaceName: string;
  children: React.ReactNode;
}

const iconMap: Record<string, string> = {
  users: "👥",
  contact: "📇",
  file: "📄",
  dashboard: "📊",
  settings: "⚙️",
  audit: "📜",
};

function getIcon(icon: string): string {
  return iconMap[icon] ?? "📄";
}

export default function NavigationShell({
  navigation,
  workspaceId,
  workspaceName,
  children,
}: NavigationShellProps) {
  const pathname = usePathname();

  const items: NavigationItem[] = [
    {
      id: "dashboard",
      workspaceId,
      label: "仪表盘",
      route: "/dashboard",
      icon: "dashboard",
      sortOrder: 10,
      moduleId: null,
      enabled: true,
    },
    ...navigation,
    {
      id: "audit",
      workspaceId,
      label: "审计日志",
      route: "/audit",
      icon: "audit",
      sortOrder: 90,
      moduleId: null,
      enabled: true,
    },
    {
      id: "settings",
      workspaceId,
      label: "设置",
      route: "/settings",
      icon: "settings",
      sortOrder: 100,
      moduleId: null,
      enabled: true,
    },
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <Link
            href="/"
            className="text-lg font-bold text-slate-900 hover:text-blue-600"
          >
            Runory
          </Link>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {workspaceName}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {items.map((item) => {
            const href = `/w/${workspaceId}${item.route}`;
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={item.id}
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="text-base">{getIcon(item.icon)}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
