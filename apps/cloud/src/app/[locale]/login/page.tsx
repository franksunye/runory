"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isDev = process.env.NODE_ENV !== "production";
  const showDevHint = isDev || process.env.NEXT_PUBLIC_OTP_DEV_CODE_ENABLED === "true";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // In dev mode with an existing persona/session, redirect to landing page
  // which shows workspace navigation.
  useEffect(() => {
    apiFetch<{ success: boolean; data?: { authenticated: boolean } }>("/api/auth/me", { cache: "no-store" })
      .then((j) => {
        if (j.success && j.data?.authenticated === true) {
          router.replace(`/${locale}`);
        }
      })
      .catch(() => {});
  }, [router, locale]);

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return setError(t("home.form.emailRequired"));
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setSent(true);
        if (json.data.devCode) setDevCode(json.data.devCode);
      } else {
        setError(json.error?.message ?? t("home.form.sendFailed"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("home.form.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !/^\d{6}$/.test(code.trim())) {
      return setError(t("home.form.codeRequired"));
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        // Redirect to dashboard or onboarding
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(json.error?.message ?? t("home.form.verifyFailed"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("home.form.verifyFailed"));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8fc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(86,100,245,.15),transparent_30%),radial-gradient(circle_at_90%_82%,rgba(22,166,106,.1),transparent_28%)]" />
      <MarketingHeader />

      <section className="relative mx-auto flex max-w-md flex-col items-center px-6 pb-20 pt-10 lg:pt-20">
        <div className="w-full">
          <div className="mb-8 text-center">
            <div className="app-eyebrow inline-flex items-center gap-2 justify-center"><Sparkles size={15} /> {t("login.eyebrow")}</div>
            <h1 className="mt-4 text-3xl font-bold tracking-[-.03em] text-slate-950">
              {sent ? t("login.codeTitle") : t("login.title")}
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {sent
                ? `${t("login.codeSubtitle")} ${email}`
                : t("login.subtitle")}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {showDevHint && !sent && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">{t("login.devHint")}</p>
              <p className="mt-1">{t("login.devHintDesc")}</p>
            </div>
          )}

          {!sent ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                  {t("home.form.email")}
                </label>
                <div className="relative">
                  <Mail size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="app-input pl-11"
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="app-button-primary w-full">
                {loading ? t("home.form.sending") : t("home.form.send")}
                <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {devCode && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <strong>{t("home.form.dev")}</strong> <span className="font-mono text-lg font-bold tracking-widest">{devCode}</span>
                </div>
              )}
              <div>
                <label htmlFor="code" className="mb-2 block text-sm font-semibold text-slate-700">
                  {t("home.form.code")}
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="app-input text-center text-2xl font-bold tracking-[0.5em]"
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              <button type="submit" disabled={verifying} className="app-button-primary w-full">
                {verifying ? t("home.form.verifying") : t("login.verify")}
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                onClick={() => { setSent(false); setCode(""); setDevCode(null); setError(null); }}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
              >
                ← {t("login.otherEmail")}
              </button>
            </form>
          )}

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>{t("login.expiry")}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
