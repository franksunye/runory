export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-sm text-slate-600">页面未找到</p>
        <a
          href="/"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          返回首页
        </a>
      </div>
    </div>
  );
}
