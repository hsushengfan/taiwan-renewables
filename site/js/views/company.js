// 業者小檔案頁（#company-<id>）
//
//   1. 基本資料：全名、分類、能源署名單狀態、官網、公開資訊頁、上市櫃代號、能源別、案場數、裝置容量
//   2. 逐年：賣出多少（直轉供移轉量）、拿到多少憑證（發放量）、還留著多少（尚未移轉）——圖＋表
//   3. 賣出過的案場：業主、能源別、裝置容量、累計移轉量
//   4. 年報與月報（第 2 階段的資料）
//   5. 財務分析（第 3 階段）：售電單價、購電成本、價差等推估，附年報連結和頁碼（finance.js）
//
// 資料用 api_company(id) 讀（見 supabase/migrations/015_companies.sql）。

import { getCompany } from "../api.js";
import { t, getLang } from "../i18n.js";
import { el, cssVar, fmt } from "../util.js";
import { lineChart } from "../charts.js";
import { downloadButton, cardFoot } from "../download.js";
import { crumbs } from "./category.js";
import { coName } from "./companies.js";
import { financeCard } from "./finance.js";

export const autoRefresh = false;
export const showFilters = false;

const TREC_URL = "https://www.trec.org.tw/certification_trade_situation/direct_supply";
const TREC_CERT_URL = "https://www.trec.org.tw/certification";
const CASES_SHOWN = 30;          // 案場很多的業者（例如上千個），先顯示前 30 個
const REPORTS_SHOWN = 30;        // 月報從 2020 年開始收，有的業者有 80 幾份，先顯示前 30 列（年報在前、月報由新到舊）
let showAllCases = false;
let showAllReports = false;
let lastId = null;

export async function load(ctx, id) {
  const company = await getCompany(id);
  return company ? { company } : null;   // 找不到這家業者 → 主程式會顯示「找不到這個頁面」
}

const mwh = (v) => (v == null ? "—" : fmt(v, 0));
const csvNum = (v, d = 3) => (v == null ? "" : Number(v).toFixed(d));
const sep = () => (getLang() === "en" ? ", " : "、");

export function render(root, ctx, data) {
  const d = data.company;
  const c = d.company;
  if (lastId !== c.id) { showAllCases = false; showAllReports = false; lastId = c.id; }
  const rerender = () => render(root, ctx, data);
  const roleName = t("coRoleName")[c.role];
  const updated = d.as_of || "";
  const slug = `company-${c.id}`;

  const head = el("div", { className: "pagehead" }, [
    crumbs([[t("navOverview"), "#"], [t("cpBack"), "#companies"], [coName(c)]]),
    el("h2", { className: "pagetitle", textContent: c.name_zh }),
    el("p", { className: "sub", textContent: t("cpRankLine", roleName, c.rank, c.role_size) + (d.as_of ? `${getLang() === "en" ? " · " : "　"}${t("coAsOf", d.as_of)}` : "") }),
  ]);

  // ---- 1. 基本資料 ----
  const info = t("cpInfo");
  const link = (url) => (url ? el("a", { href: url, target: "_blank", rel: "noopener", textContent: url }) : el("span", { className: "dim", textContent: "—" }));
  const row = (label, value) => [el("dt", { textContent: label }), el("dd", {}, [value])];
  const capText = c.capacity_kw == null ? "—"
    : `${fmt(c.capacity_kw / 1000, 1)} MW` + (c.cap_matched < c.case_count ? t("cpCapNote", c.cap_matched, c.case_count) : "");
  const note = getLang() === "en" ? (c.note_en || c.note_zh) : c.note_zh;
  const infoCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("cpInfoTitle") })]),
    el("dl", { className: "deflist" }, [
      ...row(info.role, document.createTextNode(roleName)),
      ...row(info.registry, document.createTextNode(c.registry_note || (c.registry_checked_on ? t("cpRegistryChecked", c.registry_checked_on) : "—"))),
      ...row(info.website, link(c.website)),
      ...row(info.disclosure, link(c.disclosure_url)),
      ...row(info.stock, document.createTextNode(c.stock_code || "—")),
      ...row(info.energy, document.createTextNode((c.energies || []).map((e) => t("coEnergy", e)).join(sep()) || "—")),
      ...row(info.cases, document.createTextNode(fmt(c.case_count, 0))),
      ...row(info.cap, document.createTextNode(capText)),
      ...(note ? row(info.note, document.createTextNode(note)) : []),
    ]),
  ]);

  // ---- 2. 逐年 ----
  const years = d.by_year.map((r) => r.year);
  const partial = new Set(years.map((y, i) => (d.as_of && Number(d.as_of.slice(0, 4)) === y ? i : -1)).filter((i) => i >= 0));
  const S = t("cpSeries");
  const series = [
    ["sold_mwh", S.sold, "--g4"], ["issued_mwh", S.issued, "--g3"], ["remaining_mwh", S.remaining, "--g6"],
  ].map(([k, label, color]) => ({
    label, color: cssVar(color), hollow: partial,
    values: d.by_year.map((r) => (r[k] == null ? null : Number(r[k]))),
    format: (v) => `${fmt(v, 0)} MWh`,
  }));
  const yearBox = el("div");
  const legend = el("div", { className: "legend static" }, series.map((s) => {
    const k = el("i", { className: "k" });
    k.style.setProperty("--c", s.color);
    return el("span", { className: "lg" }, [k, document.createTextNode(s.label)]);
  }));
  const ycols = t("cpYearCols");
  const yearHead = (y) => t("coYearHead", y, d.as_of);
  const yearTable = el("div", { className: "scroll" }, [el("table", {}, [
    el("thead", {}, [el("tr", {}, ycols.map((h) => el("th", { textContent: h })))]),
    el("tbody", {}, d.by_year.map((r) => el("tr", {}, [
      el("td", { textContent: yearHead(r.year) }), el("td", { textContent: mwh(r.sold_mwh) }),
      el("td", { textContent: mwh(r.issued_mwh) }), el("td", { textContent: mwh(r.remaining_mwh) }),
    ]))),
  ])]);
  const yearCsv = () => [ycols.map((h, i) => (i ? `${h} (MWh)` : h)),
    ...d.by_year.map((r) => [yearHead(r.year), csvNum(r.sold_mwh), csvNum(r.issued_mwh), csvNum(r.remaining_mwh)])];
  const yearCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("cpYearTitle") })]),
    legend, yearBox, yearTable,
    el("p", { className: "note", textContent: t("cpYearNote") }),
    cardFoot([[t("coSrc"), TREC_URL], [t("coSrcCert"), TREC_CERT_URL]], updated, downloadButton(`taiwan-renewable-${slug}-by-year.csv`, yearCsv)),
  ]);

  // ---- 3. 賣出過的案場 ----
  const cc = t("cpCasesCols");
  const cases = d.cases;
  const shown = showAllCases ? cases : cases.slice(0, CASES_SHOWN);
  const yearsText = (r) => (r.first_year === r.last_year ? String(r.first_year) : `${r.first_year}–${r.last_year}`);
  const casesTable = el("div", { className: "scroll" }, [el("table", {}, [
    el("thead", {}, [el("tr", {}, cc.map((h, i) => el("th", { textContent: h, className: i < 3 ? "c" : "" })))]),
    el("tbody", {}, shown.map((r) => el("tr", {}, [
      el("td", { className: "c", textContent: r.case_name || "—" }),
      el("td", { className: "c", textContent: r.owner || "—" }),
      el("td", { className: "c", textContent: r.energy ? t("coEnergy", r.energy) : "—" }),
      el("td", { textContent: r.capacity_kw == null ? "—" : fmt(r.capacity_kw, 1), className: r.capacity_kw == null ? "dim" : "" }),
      el("td", { textContent: mwh(r.sold_mwh) }),
      el("td", { textContent: yearsText(r) }),
    ]))),
  ])]);
  const casesCsv = () => [[getLang() === "en" ? "T-REC plant ID" : "T-REC 案場編號", ...cc],
    ...cases.map((r) => [r.case_id, r.case_name, r.owner, r.energy ? t("coEnergy", r.energy) : "", csvNum(r.capacity_kw, 3), csvNum(r.sold_mwh), yearsText(r)])];
  const casesCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("cpCasesTitle", fmt(cases.length, 0)) })]),
    casesTable,
    cases.length > shown.length ? el("button", { type: "button", className: "chip more", textContent: t("cpCasesMore", fmt(cases.length, 0)), onclick: () => { showAllCases = true; rerender(); } }) : "",
    el("p", { className: "note", textContent: t("cpCasesNote") }),
    cardFoot([[t("coSrc"), TREC_URL], [t("coSrcCert"), TREC_CERT_URL]], updated, downloadButton(`taiwan-renewable-${slug}-plants.csv`, casesCsv)),
  ]);

  // ---- 4. 年報與月報 ----
  const rc = t("cpReportsCols");
  const reports = d.reports;
  const reportsShown = showAllReports ? reports : reports.slice(0, REPORTS_SHOWN);
  const reportsCsv = () => [rc, ...reports.map((r) => [t("cpReportType")[r.report_type], r.year ?? "", r.month ?? "", t("cpReportStatus")[r.status], r.url || "", r.note || ""])];
  const reportsCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("cpReportsTitle") })]),
    reports.length
      ? el("div", { className: "scroll" }, [el("table", {}, [
        el("thead", {}, [el("tr", {}, rc.map((h, i) => el("th", { textContent: h, className: i === 0 || i >= 3 ? "c" : "" })))]),
        el("tbody", {}, reportsShown.map((r) => el("tr", {}, [
          el("td", { className: "c", textContent: t("cpReportType")[r.report_type] }),
          // 年份空白的列代表整家公司（例如整家都找不到），不是某一份報告
          el("td", { textContent: r.year ?? "—" }), el("td", { textContent: r.month ?? "—" }),
          el("td", { className: "c", textContent: t("cpReportStatus")[r.status] }),
          // 「連結失效」的網址只留在資料庫做紀錄，網站上不放連結
          el("td", { className: "c" }, [r.url && r.status !== "broken" ? el("a", { href: r.url, target: "_blank", rel: "noopener", textContent: t("cpReportOpen") }) : document.createTextNode("—")]),
          el("td", { className: "c", textContent: r.note || "" }),
        ]))),
      ])])
      : el("p", {}, [el("b", { textContent: t("cpPending") + t("colon") }), document.createTextNode(t("cpPendingReports"))]),
    reports.length > reportsShown.length ? el("button", { type: "button", className: "chip more", textContent: t("cpReportsMore", fmt(reports.length, 0)), onclick: () => { showAllReports = true; rerender(); } }) : "",
    reports.length ? cardFoot([[info.disclosure, c.disclosure_url]], "", downloadButton(`taiwan-renewable-${slug}-reports.csv`, reportsCsv)) : "",
  ]);

  // ---- 5. 財務分析（第 3 階段，見 finance.js）----
  const finCard = financeCard(c, d, rerender);

  root.replaceChildren(head, infoCard, finCard, yearCard, casesCard, reportsCard);
  requestAnimationFrame(() => lineChart(yearBox, { xs: years, series, label: t("cpYearLabel") }));
}
