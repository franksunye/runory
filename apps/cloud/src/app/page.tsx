"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, Boxes, Check, CheckCircle2, Cloud, Code2, GitBranch, Layers3, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

export default function LandingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAuthed(j.success && j.data?.authenticated === true))
      .catch(() => setAuthed(false));
  }, []);

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return setError(t("home.form.emailRequired"));
    if (!name.trim()) return setError(t("home.form.workspaceRequired"));
    setLoading(true);
    setError(null);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setStep(2);
        if (json.data?.devCode) setDevCode(json.data.devCode);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        // Backend auto-onboards (org + workspace) on first login.
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

  const handleCreateWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("home.form.workspaceRequired"));
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        router.push(`/w/${json.data.slug}/dashboard`);
      } else {
        setError(json.error?.message ?? t("home.form.createFailed"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("home.form.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const goBackToStep1 = () => {
    setStep(1);
    setCode("");
    setDevCode(null);
    setError(null);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8fc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(86,100,245,.15),transparent_30%),radial-gradient(circle_at_90%_82%,rgba(22,166,106,.1),transparent_28%)]" />
      <MarketingHeader authenticated={authed === true} />

      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.12fr_.88fr] lg:px-10 lg:pt-20">
        <div>
          <div className="app-eyebrow flex items-center gap-2"><Sparkles size={15} /> {t("home.eyebrow")}</div>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.12] tracking-[-.04em] text-slate-950 sm:text-6xl">{t("home.title")}</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">{t("home.subtitle")}</p>
          <div className="mt-8 grid max-w-xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
            {[t("home.proof.metadata"), t("home.proof.audit"), t("home.proof.isolation")].map((item) => <div key={item} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" />{item}</div>)}
          </div>
        </div>

        <div className="app-card relative p-2 sm:p-3">
          <div className="rounded-xl bg-slate-950 p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-300">{t("home.form.eyebrow")}</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">{t("home.form.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t("home.form.subtitle")}</p>

            {authed === true ? (
              <form onSubmit={handleCreateWorkspace} className="mt-7">
                <label htmlFor="workspace-name" className="mb-2 block text-sm font-semibold text-slate-200">{t("home.form.workspace")}</label>
                <input
                  id="workspace-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("home.form.workspacePlaceholder")}
                  className="app-input border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-indigo-400"
                  autoFocus
                />
                {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
                <button type="submit" disabled={creating} className="app-button-primary mt-4 w-full">
                  {creating ? t("home.form.creating") : t("home.form.create")}<ArrowRight size={17} />
                </button>
              </form>
            ) : step === 1 ? (
              <form onSubmit={handleRequestOtp} className="mt-7 space-y-4">
                <div>
                  <label htmlFor="landing-email" className="mb-2 block text-sm font-semibold text-slate-200">{t("home.form.email")}</label>
                  <div className="relative">
                    <Mail size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="landing-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="app-input border-slate-700 bg-slate-900 pl-11 text-white placeholder:text-slate-500 focus:border-indigo-400"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="landing-workspace-name" className="mb-2 block text-sm font-semibold text-slate-200">{t("home.form.workspace")}</label>
                  <input
                    id="landing-workspace-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("home.form.workspacePlaceholder")}
                    className="app-input border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </div>
                {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
                <button type="submit" disabled={loading} className="app-button-primary w-full">
                  {loading ? t("home.form.sending") : t("home.form.send")}<ArrowRight size={17} />
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck size={13} className="text-emerald-500" />{t("home.form.onboarding")}
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="mt-7 space-y-4">
                {devCode && (
                  <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    <strong>{t("home.form.dev")}</strong> <span className="font-mono text-lg font-bold tracking-widest">{devCode}</span>
                  </div>
                )}
                <div>
                  <label htmlFor="landing-code" className="mb-2 block text-sm font-semibold text-slate-200">{t("home.form.code")}</label>
                  <input
                    id="landing-code"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="app-input border-slate-700 bg-slate-900 text-center text-2xl font-bold tracking-[0.5em] text-white placeholder:text-slate-600 focus:border-indigo-400"
                    autoFocus
                    autoComplete="one-time-code"
                  />
                  <p className="mt-2 text-xs text-slate-500">{t("home.form.codeSent")} {email}</p>
                </div>
                {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
                <button type="submit" disabled={verifying} className="app-button-primary w-full">
                  {verifying ? t("home.form.verifying") : t("home.form.verify")}<ArrowRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={goBackToStep1}
                  className="flex w-full items-center justify-center gap-1 text-center text-sm text-slate-400 hover:text-slate-200"
                >
                  <ArrowLeft size={14} />{t("home.form.back")}
                </button>
              </form>
            )}
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-600"><Layers3 size={19} className="text-indigo-600" /><span><strong className="block text-slate-800">{t("home.form.composable")}</strong>{t("home.form.composableDetail")}</span></div>
            <div className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-600"><LockKeyhole size={19} className="text-emerald-600" /><span><strong className="block text-slate-800">{t("home.form.safe")}</strong>{t("home.form.safeDetail")}</span></div>
          </div>
        </div>
      </section>

      <section id="product" className="relative border-y border-slate-200 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="max-w-3xl">
            <p className="app-eyebrow">{t("home.product.eyebrow")}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-.035em] text-slate-950 sm:text-5xl">{t("home.product.title")}</h2>
            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">{t("home.product.subtitle")}</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              [Boxes, "Module / Pack", t("home.product.modules")],
              [Bot, "Governed Agent", t("home.product.agent")],
              [ShieldCheck, "SaaS Core", t("home.product.saas")],
              [Cloud, "Portable Runtime", t("home.product.runtime")],
            ].map(([Icon, title, description]) => (
              <article key={title as string} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
                <div className="grid size-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><Icon size={20} /></div>
                <h3 className="mt-5 font-bold text-slate-950">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description as string}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-2 lg:px-10">
          <article className="overflow-hidden rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300"><Code2 size={18} /> OPEN SOURCE</div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight">{t("home.oss.title")}</h2>
            <p className="mt-4 max-w-lg leading-7 text-slate-300">{t("home.oss.body")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/open-source" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950">{t("home.oss.cta")} <ArrowRight size={16} /></Link>
              <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900"><GitBranch size={17} /> GitHub</Link>
            </div>
          </article>
          <article className="overflow-hidden rounded-3xl border border-indigo-100 bg-indigo-50 p-8 sm:p-10">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><Cloud size={18} /> RUNORY CLOUD</div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-950">{t("home.cloud.title")}</h2>
            <p className="mt-4 max-w-lg leading-7 text-slate-600">{t("home.cloud.body")}</p>
            <Link href="/pricing" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 hover:text-indigo-900">{t("home.cloud.cta")} <ArrowRight size={16} /></Link>
          </article>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6 text-center lg:px-10">
          <p className="app-eyebrow">{t("home.steps.eyebrow")}</p>
          <h2 className="mt-4 text-3xl font-bold tracking-[-.035em] text-slate-950 sm:text-5xl">{t("home.steps.title")}</h2>
          <div className="mt-12 grid gap-4 text-left md:grid-cols-3">
            {[
              ["01", t("home.steps.one.title"), t("home.steps.one.body")],
              ["02", t("home.steps.two.title"), t("home.steps.two.body")],
              ["03", t("home.steps.three.title"), t("home.steps.three.body")],
            ].map(([number, title, description]) => (
              <article key={number} className="rounded-2xl border border-slate-200 p-6">
                <span className="font-mono text-sm font-bold text-indigo-600">{number}</span>
                <h3 className="mt-7 text-lg font-bold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-10">
          <div>
            <p className="app-eyebrow">{t("home.free.eyebrow")}</p>
            <h2 className="mt-4 text-4xl font-bold tracking-[-.035em] text-slate-950">{t("home.free.title")}</h2>
            <p className="mt-5 leading-7 text-slate-600">{t("home.free.body")}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(30,38,61,.07)] sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div><span className="app-badge bg-emerald-50 text-emerald-700">{t("home.free.current")}</span><h3 className="mt-4 text-2xl font-bold">{t("home.free.plan")}</h3></div>
              <div className="text-left sm:text-right"><span className="text-4xl font-bold">¥0</span><span className="text-sm text-slate-500"> {t("home.free.month")}</span><p className="mt-1 text-xs text-slate-400">{t("home.free.stage")}</p></div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[t("home.free.email"), t("home.free.org"), t("home.free.crm"), t("home.free.install"), t("home.free.audit"), t("home.free.upgrades")].map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-700"><Check size={16} className="text-emerald-600" />{item}</div>)}
            </div>
            <Link href="/pricing" className="app-button-primary mt-8">{t("home.free.cta")} <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 lg:grid-cols-[1fr_auto] lg:px-10">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.16em] text-indigo-300">Tell it. Run it.</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-[-.035em] sm:text-5xl">{t("home.final.title")}</h2>
            <p className="mt-5 text-slate-400">{t("home.final.body")}</p>
          </div>
          <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-slate-950 hover:bg-indigo-50">{t("home.final.cta")} <ArrowRight size={17} /></Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
