import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { GraphicComponent, TooltipComponent } from "echarts/components";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import type { AggregatedTagStat } from "./tagAggregation";

echarts.use([PieChart, TooltipComponent, GraphicComponent, LabelLayout, CanvasRenderer]);

type Props = {
  items: AggregatedTagStat[];
  onSelectTag?: (tag: string) => void;
};

export function TagDonutChart({ items, onSelectTag }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const onSelectTagRef = useRef(onSelectTag);
  onSelectTagRef.current = onSelectTag;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const onResize = () => chart.resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    observer?.observe(host);
    window.addEventListener("resize", onResize);

    chart.on("click", (params) => {
      if (typeof params.name === "string") {
        onSelectTagRef.current?.(params.name);
      }
    });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!items.length) {
      chart.clear();
      chart.setOption(
        {
          graphic: [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "区间复盘添加标签后\n这里会显示错因分布",
                fill: "#68736e",
                fontSize: 13,
                lineHeight: 20,
                textAlign: "center",
              },
            },
          ],
        },
        { notMerge: true },
      );
      return;
    }

    const total = items.reduce((sum, item) => sum + item.count, 0);

    chart.setOption(
      {
        title: { show: false },
        color: items.map((item) => item.color),
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(23, 32, 28, 0.92)",
          borderWidth: 0,
          padding: [10, 12],
          textStyle: { color: "#ffffff", fontSize: 12 },
          formatter: (params: unknown) => {
            const p = params as { name?: string; value?: number; percent?: number; color?: string };
            const name = p.name ?? "";
            const count = Number(p.value ?? 0);
            const percent = Number(p.percent ?? 0).toFixed(1);
            return [
              `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">`,
              `<span style="width:8px;height:8px;border-radius:50%;background:${String(p.color ?? "#176c8f")};"></span>`,
              `<strong>${escapeHtml(name)}</strong>`,
              `</div>`,
              `数量 ${count}`,
              `<br/>占比 ${percent}%`,
            ].join("");
          },
        },
        series: [
          {
            type: "pie",
            name: "错因分布",
            radius: ["42%", "68%"],
            center: ["50%", "52%"],
            avoidLabelOverlap: true,
            padAngle: 1.2,
            itemStyle: {
              borderRadius: 4,
              borderColor: "#ffffff",
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: (params: { name?: string; value?: number; percent?: number }) => {
                const name = params.name ?? "";
                const count = Number(params.value ?? 0);
                const percent = Number(params.percent ?? 0).toFixed(1);
                return `{name|${name}}\n{meta|${count} · ${percent}%}`;
              },
              rich: {
                name: {
                  color: "#17201c",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 18,
                },
                meta: {
                  color: "#68736e",
                  fontSize: 11,
                  lineHeight: 16,
                },
              },
            },
            labelLine: {
              show: true,
              length: 12,
              length2: 10,
              smooth: 0.2,
              lineStyle: { color: "#c5d0cb" },
            },
            emphasis: {
              scale: true,
              scaleSize: 6,
              itemStyle: {
                shadowBlur: 12,
                shadowColor: "rgba(23, 36, 31, 0.18)",
              },
              label: {
                show: true,
              },
            },
            data: items.map((item) => ({
              name: item.tag,
              value: item.count,
            })),
          },
        ],
        graphic: [
          {
            type: "text",
            left: "center",
            top: "46%",
            style: {
              text: String(total),
              fill: "#17201c",
              fontSize: 22,
              fontWeight: 700,
              textAlign: "center",
            },
          },
          {
            type: "text",
            left: "center",
            top: "56%",
            style: {
              text: "次打标",
              fill: "#68736e",
              fontSize: 11,
              textAlign: "center",
            },
          },
        ],
      },
      { notMerge: true },
    );
  }, [items]);

  return <div className="tag-donut-chart" ref={hostRef} role="img" aria-label="错因标签分布环形图" />;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
