"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("请输入工作区名称");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        router.push(`/w/${json.data.id}/dashboard`);
      } else {
        setError(json.error?.message ?? "创建工作区失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建工作区失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Runory Cloud</h1>
          <p className="mt-2 text-sm text-slate-500">
            Cloud-first 业务应用平台 · 创建工作区即可开始
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label
            htmlFor="workspace-name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            工作区名称
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：我的公司"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建工作区"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          创建后将进入工作区仪表盘，可安装 CRM Lite Pack
        </p>
      </div>
    </div>
  );
}
