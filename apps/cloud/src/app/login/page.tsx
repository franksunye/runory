"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return setError("请输入邮箱地址");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setSent(true);
        if (json.data.devCode) setDevCode(json.data.devCode);
      } else {
        setError(json.error?.message ?? "验证码发送失败");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证码发送失败");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !/^\d{6}$/.test(code.trim())) {
      return setError("请输入6位验证码");
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
        // Redirect to dashboard or onboarding
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(json.error?.message ?? "验证失败");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8fc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(86,100,245,.15),transparent_30%),radial-gradient(circle_at_90%_82%,rgba(22,166,106,.1),transparent_28%)]" />
      <header className="relative mx-auto flex h-20 max-w-7xl items-center px-6 lg:px-10">
        <div className="grid size-9 place-items-center rounded-[10px] bg-slate-950 font-bold text-white">R</div>
        <span className="ml-3 text-lg font-bold tracking-tight">Runory</span>
        <span className="ml-3 hidden rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-500 sm:block">Cloud</span>
      </header>

      <section className="relative mx-auto flex max-w-md flex-col items-center px-6 pb-20 pt-10 lg:pt-20">
        <div className="w-full">
          <div className="mb-8 text-center">
            <div className="app-eyebrow inline-flex items-center gap-2 justify-center"><Sparkles size={15} /> 无密码登录</div>
            <h1 className="mt-4 text-3xl font-bold tracking-[-.03em] text-slate-950">
              {sent ? "输入验证码" : "登录到 Runory"}
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {sent
                ? `我们已向 ${email} 发送了6位验证码`
                : "使用邮箱验证码登录，无需密码。首次登录将自动创建工作区。"}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!sent ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                  邮箱地址
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
                {loading ? "发送中..." : "发送验证码"}
                <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {devCode && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <strong>开发模式：</strong>您的验证码是 <span className="font-mono text-lg font-bold tracking-widest">{devCode}</span>
                </div>
              )}
              <div>
                <label htmlFor="code" className="mb-2 block text-sm font-semibold text-slate-700">
                  验证码
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
                {verifying ? "验证中..." : "验证并登录"}
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                onClick={() => { setSent(false); setCode(""); setDevCode(null); setError(null); }}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
              >
                ← 使用其他邮箱
              </button>
            </form>
          )}

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>验证码10分钟内有效，单次使用</span>
          </div>
        </div>
      </section>
    </main>
  );
}
