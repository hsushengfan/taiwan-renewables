// 電價走勢頁（#price）
//
//   1. 主圖：歷年平均單價（表燈非營業、表燈營業、電力）＋每度售電成本
//   2. 調價時間軸（2015 年起）：點一個標記看那次審議的內容
//   3. 進階參考：應有單價（預設收合）
//
// 資料都是人工整理的（見 supabase/migrations/010_electricity_price.sql），用 api_price() 一次讀完。
// 資料庫存的是未稅值；含稅＝未稅 × 1.05，這一頁預設顯示含稅。售電成本沒有含稅的概念，不跟著切換。

import { getPrice } from "../api.js";
import { t, getLang } from "../i18n.js";
import { el, cssVar } from "../util.js";
import { lineChart, timelineChart, markerSvg } from "../charts.js";
import { taxMode, applyTax, taxLabel, taxToggle } from "../tax.js";
import { downloadButton, cardFoot } from "../download.js";
import { crumbs } from "./category.js";

export const autoRefresh = false;   // 這一頁的資料不是即時的，不用每 3 分鐘更新
export const showFilters = false;   // 不需要 24 小時／7 天的時間範圍按鈕

const TAIPOWER_URL = "https://www.taipower.com.tw";
const PRESS_URL = "https://www3.moeaea.gov.tw/ele102/Content/NewsLetter/List.aspx?MmmID=654246033427256710";

let selected = null;   // 時間軸目前選到第幾個（換語言、切換含稅時保留）

export async function load() {
  return { price: await getPrice() };
}

// 中文或英文的欄位，例如 pick(row, "summary") → row.summary_zh 或 row.summary_en
const pick = (row, base) => (getLang() === "en" && row[base + "_en"]) || row[base + "_zh"] || "";
// 顯示到小數第 4 位（售電成本照原始精度）
const fix = (v, d = 4) => (v == null ? "—" : v.toFixed(d));
const pct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);

export function render(root, ctx, data) {
  const d = data.price;
  const mode = taxMode("incl");
  const tax = taxLabel(mode);
  const rerender = () => render(root, ctx, data);

  const head = el("div", { className: "pagehead row" }, [
    el("div", {}, [crumbs([[t("navOverview"), "#"], [t("priceTitle")]]), el("h2", { className: "pagetitle", textContent: t("priceTitle") })]),
    taxToggle(mode, rerender),
  ]);

  root.replaceChildren(head, priceCard(d, mode, tax), timelineCard(d, mode, tax), requiredCard(d, mode, tax));
}

// ---------------------------------------------------------------------
// 1. 主圖：歷年平均單價＋每度售電成本
// ---------------------------------------------------------------------
function priceCard(d, mode, tax) {
  const avgYears = d.avg_unit_prices.map((r) => r.year), costYears = d.unit_costs.map((r) => r.year);
  const first = Math.min(...avgYears), lastAvg = Math.max(...avgYears), last = Math.max(lastAvg, ...costYears);
  const xs = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const price = (yr, cat) => d.avg_unit_prices.find((r) => r.year === yr && r.category === cat)?.price ?? null;
  const cost = (yr) => d.unit_costs.find((r) => r.year === yr) || null;

  // 還不是完整一年的售電成本（例如 2026 年只有 1–9 月）畫成空心點
  const partialIdx = new Set(xs.map((yr, i) => (yr > lastAvg && cost(yr) ? i : -1)).filter((i) => i >= 0));
  const priceSeries = (cat, label, colorVar) => ({
    label, color: cssVar(colorVar),
    values: xs.map((yr) => applyTax(price(yr, cat), mode)),
    format: (v) => `${fix(v)} ${t("perKwh")}`,
  });
  const series = [
    priceSeries("lamp_residential", t("catResidential"), "--g4"),
    priceSeries("lamp_business", t("catBusiness"), "--g2"),
    priceSeries("power", t("catPower"), "--g3"),
    {
      label: mode === "incl" ? t("unitCostNoTax") : t("unitCost"), color: cssVar("--ink2"), dashed: true, hollow: partialIdx,
      values: xs.map((yr) => cost(yr)?.cost ?? null),
      format: (v, i) => {
        const c = cost(xs[i]);
        return `${fix(v, c.decimals)} ${t("perKwh")}` + (partialIdx.has(i) && pick(c, "period_note") ? t("unitCostPartial", pick(c, "period_note")) : "");
      },
    },
  ];

  const legend = el("div", { className: "legend static" }, series.map((s) => {
    const k = el("i", { className: "k" + (s.dashed ? " dashed" : "") });
    k.style.setProperty("--c", s.color);
    return el("span", { className: "lg" }, [k, document.createTextNode(s.label)]);
  }));
  const chartBox = el("div");
  const notes = el("ul", { className: "notes" }, t("priceNotes").map((n) => el("li", { textContent: n })));

  // 資料來源：平均單價＋售電成本的各個來源（去掉重複）
  const sources = [[t("srcAvgPrice"), TAIPOWER_URL]];
  d.unit_costs.forEach((c) => {
    const label = pick(c, "source");
    if (!sources.some(([l]) => l === label)) sources.push([label, c.source_url]);
  });
  const lastCost = cost(Math.max(...costYears));
  const updated = t("priceChartUpdated", lastAvg, lastCost.year, pick(lastCost, "period_note"));

  const cats = [["lamp_residential", "catResidential"], ["lamp_business", "catBusiness"], ["lamp_total", "catLampTotal"], ["power", "catPower"], ["total", "catTotal"]];
  const csv = () => [
    [getLang() === "en" ? "Year" : "年度", ...cats.map(([, k]) => `${t(k)} (${t("perKwh")}, ${tax})`),
      `${t("unitCost")} (${t("perKwh")}, ${t("taxExcl")})`, getLang() === "en" ? "Unit cost note" : "售電成本備註", getLang() === "en" ? "Unit cost source" : "售電成本來源"],
    ...xs.map((yr) => {
      const c = cost(yr);
      return [yr, ...cats.map(([cat]) => { const v = applyTax(price(yr, cat), mode); return v == null ? "" : fix(v); }),
        c ? fix(c.cost, c.decimals) : "", c ? pick(c, "period_note") : "", c ? pick(c, "source") : ""];
    }),
  ];

  const card = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("priceChartTitle", tax) })]),
    legend, chartBox,
    partialIdx.size ? el("p", { className: "note", textContent: t("hollowNote", [...partialIdx].map((i) => xs[i]).join("、")) }) : "",
    notes,
    cardFoot(sources, updated, downloadButton(`taiwan-electricity-prices-${mode === "incl" ? "incl-tax" : "excl-tax"}.csv`, csv)),
  ]);
  // 圖要等卡片放進頁面、知道寬度之後才畫
  requestAnimationFrame(() => lineChart(chartBox, { xs, series, label: t("priceChartLabel") }));
  return card;
}

// ---------------------------------------------------------------------
// 2. 調價時間軸
// ---------------------------------------------------------------------
function timelineCard(d, mode, tax) {
  const evs = d.adjustments;
  if (selected == null || selected >= evs.length) selected = evs.length - 1;
  const decisionText = (ev) => t("decision")[ev.decision];
  const changeText = (ev) => (ev.decision === "increase" || ev.decision === "decrease" ? pct(ev.change_pct) : "0%");
  const title = (ev) => `${ev.effective_date} ${decisionText(ev)} ${changeText(ev)}`;

  const box = el("div");
  const detail = el("div", { className: "tl-detail" });
  const card = el("section", { className: "card" });

  const legend = el("div", { className: "legend static" }, ["increase", "decrease", "freeze", "deferred"].map((k) =>
    el("span", { className: "lg" }, [markerSvg(k), document.createTextNode(t("decision")[k])])));

  const draw = () => {
    const ev = evs[selected];
    timelineChart(box, {
      events: evs.map((e) => ({ date: e.effective_date, kind: e.decision, title: title(e) })),
      startYear: Number(evs[0].effective_date.slice(0, 4)), endYear: Number(evs[evs.length - 1].effective_date.slice(0, 4)),
      lanes: [t("laneChanged"), t("laneUnchanged")], selected,
      onSelect: (i) => { selected = i; draw(); },
    });
    const avgAfter = applyTax(ev.avg_price_after, mode);
    const row = (label, value) => el("div", { className: "kv" }, [el("dt", { textContent: label }), el("dd", {}, [value])]);
    const priceNode = el("span", { textContent: `${fix(avgAfter)} ${t("perKwh")}` });
    if (ev.avg_price_is_derived) priceNode.append(el("span", { className: "badge", textContent: t("derived") }));
    const prev = el("button", { type: "button", className: "chip", textContent: t("adjPrev"), disabled: selected === 0, onclick: () => { selected--; draw(); } });
    const next = el("button", { type: "button", className: "chip", textContent: t("adjNext"), disabled: selected === evs.length - 1, onclick: () => { selected++; draw(); } });
    detail.replaceChildren(
      el("div", { className: "tl-head" }, [markerSvg(ev.decision, 14), el("b", { textContent: `${decisionText(ev)}　${ev.effective_date}` }),
        el("span", { className: "tl-nav" }, [prev, next])]),
      el("dl", {}, [
        row(t("adjChange"), document.createTextNode(changeText(ev))),
        row(t("adjAvgAfter", tax), priceNode),
        row(t("adjSummary"), document.createTextNode(pick(ev, "summary") || decisionText(ev))),
        row("", ev.announcement_url
          ? el("a", { href: ev.announcement_url, target: "_blank", rel: "noopener", textContent: t("adjLink") })
          : el("span", { className: "dim", textContent: t("adjNoLink") })),
      ]),
      ev.avg_price_is_derived ? el("p", { className: "note", textContent: t("adjDerivedNote") }) : "",
    );
  };

  const last = evs[evs.length - 1];
  const csv = () => [
    getLang() === "en"
      ? ["Effective date", "Decision", "Average change (%)", `Average price after (${t("perKwh")}, ${tax})`, "Estimated", "Key points", "Taipower announcement"]
      : ["生效日", "決定", "平均調幅（%）", `調整後平均電價（${t("perKwh")}，${tax}）`, "推算", "重點", "台電公告"],
    ...evs.map((e) => [e.effective_date, decisionText(e), e.change_pct == null ? "" : e.change_pct.toFixed(2),
      fix(applyTax(e.avg_price_after, mode)), e.avg_price_is_derived ? (getLang() === "en" ? "yes" : "是") : "",
      pick(e, "summary"), e.announcement_url || ""]),
  ];

  card.append(
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("timelineTitle") }), el("span", { className: "sub", textContent: t("timelineHint") })]),
    legend, box, detail,
    el("p", { className: "note", textContent: t("no2017") }),
    cardFoot([[t("srcAdjust"), PRESS_URL]], t("adjUpdated", last.effective_date),
      downloadButton(`taiwan-electricity-price-adjustments-${mode === "incl" ? "incl-tax" : "excl-tax"}.csv`, csv)),
  );
  requestAnimationFrame(draw);
  return card;
}

// ---------------------------------------------------------------------
// 3. 進階參考：應有單價（預設收合；資料少於 4 筆時只放表格、不畫圖）
// ---------------------------------------------------------------------
function requiredCard(d, mode, tax) {
  const rows = d.required;
  const gapText = (r) => {
    if (r.base_price == null) return "—";
    const gap = applyTax(r.required_price - r.base_price, mode);
    const share = pct(((r.required_price - r.base_price) / r.base_price) * 100);
    return `${gap > 0 ? "+" : ""}${fix(gap)}` + (getLang() === "en" ? ` (${share})` : `（${share}）`);
  };
  const cols = t("requiredCols", tax);
  const table = el("div", { className: "scroll" }, [el("table", {}, [
    el("thead", {}, [el("tr", {}, cols.map((c, i) => el("th", { textContent: c, className: i === 0 || i === 5 ? "c" : "" })))]),
    el("tbody", {}, rows.map((r) => el("tr", {}, [
      el("td", { className: "c", textContent: pick(r, "period_label") }),
      el("td", { textContent: r.meeting_date }),
      el("td", { textContent: fix(applyTax(r.required_price, mode)) }),
      el("td", { textContent: fix(applyTax(r.base_price, mode)) }),
      el("td", { textContent: gapText(r) }),
      el("td", { className: "c" }, [el("a", { href: r.source_url, target: "_blank", rel: "noopener", textContent: t("requiredSource") })]),
    ]))),
  ])]);
  const csv = () => [cols, ...rows.map((r) => [pick(r, "period_label"), r.meeting_date, fix(applyTax(r.required_price, mode)),
    r.base_price == null ? "" : fix(applyTax(r.base_price, mode)), r.base_price == null ? "" : fix(applyTax(r.required_price - r.base_price, mode)), r.source_url])];
  const lastMeeting = rows.length ? rows[rows.length - 1].meeting_date : "";

  const details = el("details", { className: "card collapse" }, [
    el("summary", {}, [el("h2", { textContent: t("requiredTitle") })]),
    el("p", { className: "note", textContent: t("requiredNote") }),
    table,
    cardFoot([[t("srcRequired"), rows.length ? rows[rows.length - 1].source_url : null]], lastMeeting ? t("requiredUpdated", lastMeeting) : "",
      downloadButton(`taiwan-required-unit-price-${mode === "incl" ? "incl-tax" : "excl-tax"}.csv`, csv)),
  ]);
  return details;
}
