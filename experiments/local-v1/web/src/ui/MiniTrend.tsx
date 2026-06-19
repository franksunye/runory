import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export function MiniTrend({ data }: { data: Array<{ date: string; amount: number }> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);

    const resize = () => chartRef.current?.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.setOption({
      grid: { left: 42, right: 18, top: 22, bottom: 34 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: data.map((item) => item.date.slice(5).replace("-", "/")),
        axisLine: { lineStyle: { color: "#e5e7eb" } },
        axisTick: { show: false },
        axisLabel: { color: "#7b8191" }
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#7b8191",
          formatter: (value: number) => {
            if (value >= 1000) return `$${Math.round(value / 1000)}k`;
            return `$${Math.round(value)}`;
          }
        },
        splitLine: { lineStyle: { color: "#eef0f5" } }
      },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "line",
          smooth: true,
          data: data.map((item) => item.amount),
          symbolSize: 7,
          lineStyle: { width: 3, color: "#5b6cff" },
          itemStyle: { color: "#5b6cff" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(91, 108, 255, 0.24)" },
                { offset: 1, color: "rgba(91, 108, 255, 0.02)" }
              ]
            }
          }
        }
      ]
    });
  }, [data]);

  return (
    <div className="trend-shell">
      <div className="mini-trend" ref={ref} />
      {data.length === 0 ? (
      <div className="chart-empty">
        <span>等待费用数据</span>
      </div>
      ) : null}
    </div>
  );
}
