import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { LocaleLink } from "@/components/LocaleLink";
import { getAgentRuntimeArticle } from "@/content/agent-runtime-articles";

export async function AgentRuntimeArticlePage({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const loc = locale === "zh" ? "zh" : "en";
  const article = getAgentRuntimeArticle(loc, slug);

  if (!article) return null;

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <article>
        <header className="mx-auto max-w-5xl px-5 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20 lg:px-10">
          <LocaleLink href="/resources" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-950"><ArrowLeft size={16} />{loc === "zh" ? "返回资源" : "Back to Resources"}</LocaleLink>
          <p className="mt-10 text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{article.category}</p>
          <h1 className="mt-5 max-w-5xl font-serif text-5xl leading-[1.03] tracking-[-.045em] sm:text-7xl">{article.title}</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">{article.description}</p>
          <div className="mt-7 flex flex-wrap gap-4 text-sm text-neutral-500"><span>{article.readingTime}</span><span>•</span><time dateTime={article.publishedAt}>{article.publishedAt}</time></div>
        </header>

        <section className="border-y border-black/10 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:px-6 sm:py-20 lg:px-10">
            <div className="grid gap-12 lg:grid-cols-[1fr_260px] lg:gap-16">
              <div className="space-y-12">
                {article.sections.map(([title, body], index) => (
                  <section key={title}>
                    <div className="flex items-start gap-4"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-orange-50 text-xs font-semibold text-orange-700">0{index + 1}</span><div><h2 className="text-2xl font-semibold tracking-[-.02em] sm:text-3xl">{title}</h2>{body.split("\n\n").map((paragraph) => <p key={paragraph} className="mt-5 text-base leading-8 text-neutral-700">{paragraph}</p>)}</div></div>
                  </section>
                ))}
              </div>
              <aside className="h-fit rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 lg:sticky lg:top-24">
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-orange-600">{loc === "zh" ? "关键结论" : "Key takeaways"}</p>
                <div className="mt-5 space-y-4">{article.takeaways.map((item) => <div key={item} className="flex gap-3"><Check size={17} className="mt-1 shrink-0 text-orange-600" /><p className="text-sm leading-6 text-neutral-700">{item}</p></div>)}</div>
              </aside>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-20 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{loc === "zh" ? "继续阅读" : "Continue reading"}</p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">{article.relatedSlugs.filter((relatedSlug) => getAgentRuntimeArticle(loc, relatedSlug)).map((relatedSlug) => { const related = getAgentRuntimeArticle(loc, relatedSlug)!; return <LocaleLink key={relatedSlug} href={`/resources/${relatedSlug}`} className="group rounded-2xl border border-black/10 bg-white p-6"><span className="text-xs font-semibold uppercase tracking-[.14em] text-orange-600">{related.category}</span><h2 className="mt-4 text-lg font-semibold leading-7">{related.title}</h2><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">{loc === "zh" ? "阅读文章" : "Read article"}<ArrowRight size={15} className="transition group-hover:translate-x-1" /></span></LocaleLink>; })}</div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-6 sm:pb-28 lg:px-10"><div className="rounded-[28px] bg-neutral-950 px-6 py-10 text-white sm:px-10 sm:py-14 lg:flex lg:items-end lg:justify-between lg:gap-12"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{loc === "zh" ? "在真实流程中验证" : "Prove it in a real workflow"}</p><h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">{loc === "zh" ? "从一条关键业务流程开始。" : "Start with one priority business workflow."}</h2><p className="mt-5 max-w-2xl leading-7 text-neutral-300">{loc === "zh" ? "在 1–2 周内验证 Agent、业务数据、权限、流程与执行闭环。" : "Validate the Agent, business data, permissions, workflow, and execution loop in 1–2 weeks."}</p></div><LocaleLink href="/pilot" className="mt-8 inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-white px-6 font-semibold text-neutral-950 lg:mt-0">{loc === "zh" ? "启动试点" : "Start a Pilot"}<ArrowRight size={18} /></LocaleLink></div></section>
      </article>
      <MarketingFooter />
    </main>
  );
}
