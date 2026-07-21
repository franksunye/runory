import { redirect } from "next/navigation";

/**
 * Root path redirect. Middleware handles locale detection and redirects to
 * /en or /zh based on the locale cookie / Accept-Language header. This page
 * is a fallback for cases where middleware doesn't intercept (e.g. dev mode).
 */
export default function RootPage() {
  redirect("/en");
}
