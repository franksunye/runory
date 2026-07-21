import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f1]">
      <div className="text-center">
        <p className="text-7xl font-bold text-neutral-300">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-neutral-900">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-600">The page you are looking for doesn&apos;t exist.</p>
        <Link href="/en" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white">
          Go home
        </Link>
      </div>
    </main>
  );
}
