"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">出错了</h1>
        <p className="mt-2 text-sm text-slate-600">
          {error.message || "发生了意外错误"}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          重试
        </button>
      </div>
    </div>
  );
}
