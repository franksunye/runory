import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileInput, Loader2, Receipt, ShieldCheck, UploadCloud } from "lucide-react";
import { api, type DashboardSummary, type ExpenseRecord } from "../api";
import { day, money, time } from "./format";
import { EmptyState } from "./DashboardPage";
import { MiniTrend } from "./MiniTrend";

const demoText = `Vendor: Restaurant Depot
Date: 2026-06-16
Amount: 528.00
Currency: USD
Category: kitchen-supplies
Description: 厨房耗材
Confidence: 0.95`;

interface ExpenseIntakePageProps {
  dashboard: DashboardSummary;
  expenses: ExpenseRecord[];
  refresh: () => Promise<void>;
}

export function ExpenseIntakePage({ dashboard, expenses, refresh }: ExpenseIntakePageProps) {
  const [text, setText] = useState(demoText);
  const [isSubmitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const importedToday = useMemo(() => expenses.slice(0, 5), [expenses]);

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await api.createExpenseFromText(text);
      setMessage(result.success ? "已完成入账，页面数据将实时同步。" : "录入失败");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "录入失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-grid intake-grid">
      <div className="kpi-row intake-kpis">
        <Kpi title="本次导入" value="1" note="段文本" icon={<FileInput size={18} />} />
        <Kpi title="已自动入账" value={String(dashboard.monthExpenseCount)} note="条记录" icon={<CheckCircle2 size={18} />} />
        <Kpi title="待确认" value={String(dashboard.reviewCount)} note="需人工复核" icon={<Clock3 size={18} />} />
        <Kpi title="本月费用" value={money(dashboard.monthExpenseTotal)} note="实时汇总" icon={<Receipt size={18} />} />
      </div>

      <section className="panel trend-panel intake-trend-panel">
        <div className="panel-header">
          <div>
            <h3>本月费用趋势</h3>
            <p>新增费用会先影响趋势和指标，再沉淀到导入记录。</p>
          </div>
        </div>
        <MiniTrend data={dashboard.trend} />
      </section>

      <section className="panel import-table-panel">
        <div className="panel-header">
          <div>
            <h3>本次导入记录</h3>
            <p>最新费用记录会自动出现在列表中。</p>
          </div>
        </div>
        {importedToday.length === 0 ? (
          <EmptyState title="还没有费用记录" detail="提交第一条费用后，列表、指标和趋势会同时更新。" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>票据</th>
                <th>供应商</th>
                <th>日期</th>
                <th>金额</th>
                <th>类别</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {importedToday.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <div className="receipt-thumb">
                      <Receipt size={18} />
                    </div>
                  </td>
                  <td>
                    <strong>{expense.vendorName}</strong>
                    <span>{expense.source === "codex" ? "Codex" : "UI"}</span>
                  </td>
                  <td>{day(expense.expenseDate)}</td>
                  <td>{money(expense.amount, expense.currency)}</td>
                  <td>
                    <span className="category-pill">{expense.category}</span>
                  </td>
                  <td>
                    <span className="state-pill committed">已入账</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel activity-panel intake-activity-panel">
        <div className="panel-header">
          <h3>最近活动</h3>
        </div>
        <div className="activity-list compact">
          {dashboard.recentActivity.length === 0 ? (
            <EmptyState title="等待第一条活动" detail="费用入账后会出现最近处理记录。" />
          ) : (
            dashboard.recentActivity.map((activity) => (
              <div className="activity-item" key={activity.id}>
                <span className="activity-dot" />
                <div>
                  <strong>{activity.title}</strong>
                  <p>{activity.detail}</p>
                </div>
                <time>{time(activity.createdAt)}</time>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel intake-composer">
        <div className="panel-header">
          <div>
            <h3>Codex 半结构化费用文本</h3>
            <p>把 Codex 整理好的费用信息提交入账，系统会同步更新指标和列表。</p>
          </div>
          <span className="status-pill ok">
            <span /> 录入能力已连接
          </span>
        </div>
        <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        <div className="composer-actions">
          <button className="primary-button" onClick={submit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={17} className="spin" /> : <UploadCloud size={17} />}
            Codex 入账
          </button>
          {message ? <p>{message}</p> : <p>入账前会自动完成金额、日期和置信度校验。</p>}
        </div>
      </section>

      <section className="panel process-panel">
        <div className="panel-header">
          <h3>识别与处理概览</h3>
        </div>
        <dl className="process-list">
          <div>
            <dt>识别来源</dt>
            <dd>文本识别结果</dd>
          </div>
          <div>
            <dt>业务规则</dt>
            <dd>5 条</dd>
          </div>
          <div>
            <dt>重复检测</dt>
            <dd>
              <CheckCircle2 size={15} /> POC 简化
            </dd>
          </div>
          <div>
            <dt>写入边界</dt>
            <dd>
              <ShieldCheck size={15} /> 规则校验
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Kpi({ title, value, note, icon }: { title: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <section className="kpi-card">
      <div className="kpi-title">
        <span>{title}</span>
        <div className="kpi-icon">{icon}</div>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}
