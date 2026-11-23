// 業者排名頁（#companies）
//
//   1. 說明：資料來源、資料到哪個月、排名怎麼算、看排名時要注意的地方
//   2. 分頁：售電業前 20、發電業前 20
//   3. 橫向長條圖：前 20 名的累計移轉量（依年份堆疊）；依某一年排序時，改畫那一年
//   4. 表格：累計排名、目前名次、業者、能源別、累計、每一年各一欄、案場數、裝置容量
//      點「累計」或某一年的欄位標題可以排序（名單固定是累計前 20 名，排序只改變先後）
//
// 資料由 Edge Function trec-sync 每月從 T-REC 抓（見 docs/specs/companies.md），用 api_company_rankings() 讀。

import { getCompanyRankings } from "../api.js";
import { t, getLang } from "../i18n.js";
import { el, cssVar, fmt } from "../util.js";
import { hbarChart } from "../charts.js";
import { downloadButton, cardFoot } from "../download.js";
import { crumbs } from "./category.js";

export const autoRefresh = false;   // 每月才更新一次，不用每 3 分鐘重讀
export const showFilters = false;   // 不需要 24 小時／7 天的時間範圍按鈕

const TREC_URL = "https://www.trec.org.tw/certification_trade_situation/direct_supply";
const TREC_CERT_URL = "https://www.trec.org.tw/certification";

// 目前顯示哪一個分頁、各分頁怎麼排序（切換語言、改變視窗大小時保留）
let tab = "retailer";
const sorts = { retailer: { key: "cum", dir: "desc" }, generator: { key: "cum", dir: "desc" } };

export async function load() {
  return { rankings: await getCompanyRankings() };
}

// 業者在網站上顯示的名稱：中文用簡稱；英文還沒有英文名稱時也用中文簡稱
export const coName = (c) => (getLang() === "en" && c.name_en) || c.short_name_zh;
const energies = (c) => (c.energies || []).map((e) => t("coEnergy", e)).join(getLang() === "en" ? ", " : "、");
const mwh = (v) => (v == null ? "—" : fmt(v, 0));
const capMw = (kw) => (kw == null ? "—" : fmt(kw / 1000, 1));
// 某一家某一年的移轉量；沒有交易是 null
const yearVal = (c, y) => (c.sold_by_year && c.sold_by_year[String(y)] != null ? Number(c.sold_by_year[String(y)]) : null);
const sortVal = (c, key) => (key === "cum" ? Number(c.cum_mwh) : yearVal(c, key));

// 依目前的排序排好 20 家：沒有交易的年份一律排在最後（不論大到小或小到大）；一樣大時照累計排名
function sorted(list, { key, dir }) {
  return [...list].sort((a, b) => {
    const va = sortVal(a, key), vb = sortVal(b, key);
    if (va == null && vb == null) return a.rank - b.rank;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (dir === "desc" ? vb - va : va - vb) || a.rank - b.rank;
  });
}

export function render(root, ctx, data) {
  const d = data.rankings;
  const years = d.years || [];
  const rerender = () => render(root, ctx, data);
  const list = tab === "retailer" ? d.retailers : d.generators;
  const sort = sorts[tab];
  const rows = sorted(list, sort);
  const roleName = t("coRoleName")[tab];
  const yearHead = (y) => t("coYearHead", y, d.as_of);
  const updated = d.as_of || "";
  const fileRole = tab === "retailer" ? "retailers" : "generators";
  const fileSort = sort.key === "cum" ? "by-total" : `by-${sort.key}`;

  const head = el("div", { className: "pagehead" }, [
    crumbs([[t("navOverview"), "#"], [t("navCompanies")]]),
    el("h2", { className: "pagetitle", textContent: t("coTitle") }),
    el("p", { className: "sub", textContent: t("coLead") + (d.as_of ? `　${t("coAsOf", d.as_of)}` : "") }),
  ]);

  // ---- 分頁 ----
  const tabs = el("div", { className: "seg", role: "tablist" }, ["retailer", "generator"].map((k) => {
    const b = el("button", { type: "button", role: "tab", textContent: t("coTabs")[k], onclick: () => { tab = k; rerender(); } });
    b.setAttribute("aria-pressed", String(tab === k));
    b.setAttribute("aria-selected", String(tab === k));
    return b;
  }));

  // ---- 長條圖：依累計排序時依年份堆疊；依某一年排序時只畫那一年 ----
  const chartBox = el("div");
  const byYear = sort.key !== "cum";
  const layers = byYear
    ? [{ label: String(sort.key), color: cssVar("--g4") }]
    : years.map((y, i) => ({ label: yearHead(y), color: yearColor(i, years.length) }));
  const chartRows = rows.map((c) => ({
    label: coName(c), href: `#company-${c.company_id}`,
    values: byYear ? [yearVal(c, sort.key)] : years.map((y) => yearVal(c, y)),
  }));
  const chartLegend = byYear ? "" : el("div", { className: "legend static" }, layers.map((l) => {
    const k = el("i", { className: "k box" });
    k.style.setProperty("--c", l.color);
    return el("span", { className: "lg" }, [k, document.createTextNode(l.label)]);
  }));
  const chartCsv = () => [
    [t("coCols").name, ...(byYear ? [`${yearHead(sort.key)} (${t("coUnit")})`] : [...years.map((y) => `${yearHead(y)} (${t("coUnit")})`), `${t("coCols").cum} (${t("coUnit")})`])],
    ...rows.map((c) => [c.name_zh, ...(byYear ? [mwhCsv(yearVal(c, sort.key))] : [...years.map((y) => mwhCsv(yearVal(c, y))), mwhCsv(c.cum_mwh)])]),
  ];
  const chartCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("coChartTitle", roleName, byYear ? t("coChartYear", yearHead(sort.key)) : t("coChartCum")) })]),
    chartLegend, chartBox,
    cardFoot([[t("coSrc"), TREC_URL]], updated, downloadButton(`taiwan-renewable-${fileRole}-chart-${fileSort}.csv`, chartCsv)),
  ]);

  // ---- 表格 ----
  const cols = t("coCols");
  const sortButton = (key, label) => {
    const active = sort.key === key;
    const th = el("th", {}, [el("button", {
      type: "button", className: "thsort", textContent: label,
      onclick: () => {
        sorts[tab] = active ? { key, dir: sort.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" };
        rerender();
      },
    })]);
    th.setAttribute("aria-sort", active ? (sort.dir === "desc" ? "descending" : "ascending") : "none");
    return th;
  };
  const headRow = el("tr", {}, [
    el("th", { className: "c sticky", textContent: cols.name }),
    el("th", { textContent: cols.rank }),
    el("th", { textContent: cols.now }),
    el("th", { className: "c", textContent: cols.energy }),
    sortButton("cum", cols.cum),
    ...years.map((y) => sortButton(y, yearHead(y))),
    el("th", { textContent: cols.cases }),
    el("th", { textContent: cols.cap }),
  ]);
  const bodyRows = rows.map((c, i) => {
    const nameCell = el("td", { className: "c sticky" }, [el("a", { href: `#company-${c.company_id}`, textContent: coName(c) })]);
    if (c.registry_note) nameCell.append(el("span", { className: "dim", textContent: t("coRegistryMark"), title: (getLang() === "en" && c.note_en) || c.registry_note }));
    return el("tr", {}, [
      nameCell,
      el("td", { textContent: c.rank }),
      el("td", { textContent: i + 1 }),
      el("td", { className: "c", textContent: energies(c) }),
      el("td", { textContent: mwh(c.cum_mwh), className: sort.key === "cum" ? "sortcol" : "" }),
      ...years.map((y) => el("td", { textContent: mwh(yearVal(c, y)), className: (sort.key === y ? "sortcol " : "") + (yearVal(c, y) == null ? "dim" : "") })),
      el("td", { textContent: fmt(c.case_count, 0) }),
      el("td", { textContent: capMw(c.capacity_kw) }),
    ]);
  });
  const marked = list.filter((c) => c.registry_note);
  const tableCsv = () => [
    [cols.rank, cols.now, cols.name, getLang() === "en" ? "Short name" : "簡稱", cols.energy, `${cols.cum} (${t("coUnit")})`,
      ...years.map((y) => `${yearHead(y)} (${t("coUnit")})`), cols.cases, cols.cap, getLang() === "en" ? "Note" : "備註"],
    ...rows.map((c, i) => [c.rank, i + 1, c.name_zh, c.short_name_zh, energies(c), mwhCsv(c.cum_mwh),
      ...years.map((y) => mwhCsv(yearVal(c, y))), c.case_count, c.capacity_kw == null ? "" : (c.capacity_kw / 1000).toFixed(3), c.registry_note || ""]),
  ];
  const tableCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("coTableTitle", roleName) })]),
    el("p", { className: "note", textContent: t("coSortHint") }),
    el("div", { className: "scroll" }, [el("table", { className: "ranktable" }, [el("thead", {}, [headRow]), el("tbody", {}, bodyRows)])]),
    ...marked.map((c) => el("p", { className: "note", textContent: `${t("coRegistryMark")} ${coName(c)}${t("colon")}${(getLang() === "en" && c.note_en) || c.registry_note}` })),
    cardFoot([[t("coSrc"), TREC_URL], [t("coSrcCert"), TREC_CERT_URL]], updated,
      downloadButton(`taiwan-renewable-${fileRole}-top20-${fileSort}.csv`, tableCsv)),
  ]);

  // ---- 說明 ----
  const explain = el("section", { className: "card prose" }, [
    el("h3", { textContent: t("coMethodTitle") }),
    el("ul", {}, t("coMethod").map((s) => el("li", { textContent: s }))),
    el("h3", { textContent: t("coLimitsTitle") }),
    el("ul", {}, t("coLimits").map((s) => el("li", { textContent: s }))),
  ]);

  root.replaceChildren(head, tabs, chartCard, tableCard, explain);
  requestAnimationFrame(() => hbarChart(chartBox, {
    rows: chartRows, layers, label: t("coChartLabel"), format: (v) => fmt(v, 0),
    title: (i) => rows[i].name_zh,
  }));
}

// CSV 裡的數字：不加千分位（Excel 才能直接計算），沒有交易留空
const mwhCsv = (v) => (v == null ? "" : Number(v).toFixed(3));

// 年份的顏色：同一個藍色，越早的年份越淡、最近一年最深（和背景色混合，深淺差距拉大才分得出來）
function yearColor(i, n) {
  const pct = n <= 1 ? 100 : Math.round(12 + (88 * i) / (n - 1));
  return `color-mix(in srgb, ${cssVar("--g4")} ${pct}%, ${cssVar("--surface")})`;
}
