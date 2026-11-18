// 轉供費率頁（#wheeling）
//
//   1. 堆疊長條圖：歷年再生能源（不排碳）轉供費率的四項組成，長條頂端標合計。
//      四個項目可以點選加入或拿掉；滑鼠移上去看金額和佔比
//   2. 折線圖：平均費率合計 vs 再生能源（不排碳）費率合計
//   3. 表格：兩種費率的完整數字（換算值加註）
//   4. 說明：四項費用是什麼、誰要付哪幾項
//   每年的台電公告原檔（PDF）存在網站裡（site/files/wheeling/），表格的年份和圖下方都可以點開
//
// 資料是人工整理的（見 supabase/migrations/010_electricity_price.sql），用 api_wheeling() 讀。
// 資料庫存的是未稅值；這一頁預設顯示未稅。

import { getWheeling } from "../api.js";
import { t, getLang } from "../i18n.js";
import { el, cssVar } from "../util.js";
import { lineChart, stackedBars } from "../charts.js";
import { taxMode, applyTax, taxLabel, taxToggle } from "../tax.js";
import { downloadButton, cardFoot } from "../download.js";
import { crumbs } from "./category.js";

export const autoRefresh = false;
export const showFilters = false;

let hiddenParts = new Set();   // 堆疊圖上被拿掉的項目（切換含稅、語言時保留）

const PARTS = [["ancillary", "whAncillary", "--g4"], ["dispatch", "whDispatch", "--g2"],
  ["transmission", "whTransmission", "--g3"], ["distribution", "whDistribution", "--g6"]];

export async function load() {
  return { wheeling: await getWheeling() };
}

const pick = (row, base) => (getLang() === "en" && row[base + "_en"]) || row[base + "_zh"] || "";
const fix = (v) => (v == null ? "—" : v.toFixed(4));
const fileTax = (mode) => (mode === "incl" ? "incl-tax" : "excl-tax");
// 年份清單：中文用頓號、英文用逗號，例如「2018、2021、2024」／「2018, 2021, 2024」
const years2text = (ys) => ys.join(getLang() === "en" ? ", " : "、");

export function render(root, ctx, data) {
  const rates = data.wheeling.rates;
  const docs = data.wheeling.docs || [];
  const doc = (yr) => docs.find((x) => x.year === yr) || null;
  // 年份連到當年的台電公告原檔（沒有原檔的年份只顯示數字）
  const yearCell = (yr) => {
    const x = doc(yr);
    return x ? el("a", { href: x.pdf_path, target: "_blank", rel: "noopener", textContent: yr, title: t("whDocTitle", yr, x.announced_on, x.doc_no) }) : document.createTextNode(String(yr));
  };
  const docList = docs.length ? el("p", { className: "doclinks" }, [
    ...docs.flatMap((x, i) => [i ? document.createTextNode(" ") : "", el("a", {
      href: x.pdf_path, target: "_blank", rel: "noopener", className: "chip", textContent: t("whDocChip", x.year), title: t("whDocTitle", x.year, x.announced_on, x.doc_no),
    })]),
  ]) : "";
  const mode = taxMode("excl");
  const tax = taxLabel(mode);
  const rerender = () => render(root, ctx, data);

  const avg = rates.filter((r) => r.fuel_type === "average");
  const re = rates.filter((r) => r.fuel_type === "re_zero_carbon");
  const years = rates.map((r) => r.year);
  const xs = Array.from({ length: Math.max(...years) - Math.min(...years) + 1 }, (_, i) => Math.min(...years) + i);
  const row = (list, yr) => list.find((r) => r.year === yr) || null;
  const lastYear = Math.max(...years);
  // 資料來源：每一列記錄的來源（去掉重複），例如能源署審議資料、台電公告
  const src = [];
  rates.forEach((r) => { const l = pick(r, "source"); if (!src.some(([x]) => x === l)) src.push([l, r.source_url]); });
  const updated = t("whUpdated", lastYear);

  const head = el("div", { className: "pagehead row" }, [
    el("div", {}, [crumbs([[t("navOverview"), "#"], [t("wheelingTitle")]]), el("h2", { className: "pagetitle", textContent: t("wheelingTitle") })]),
    taxToggle(mode, rerender),
  ]);

  // ---- 1. 堆疊長條圖（再生能源） ----
  // 只畫四項都有數字的年份；只有合計的年份列在圖下方的說明
  const complete = (r) => r && PARTS.every(([f]) => r[f] != null);
  const stackXs = xs.filter((yr) => complete(row(re, yr)));
  const partialYears = xs.filter((yr) => row(re, yr) && !complete(row(re, yr)));
  const stackBox = el("div");
  const toggles = el("div", { className: "legend" });
  const drawStack = () => {
    const shown = PARTS.filter(([f]) => !hiddenParts.has(f));
    toggles.replaceChildren(...PARTS.map(([f, k, c]) => {
      const on = !hiddenParts.has(f);
      const sw = el("i");
      sw.style.background = cssVar(c);
      const b = el("button", {
        type: "button", className: "chip",
        onclick: () => {
          if (on && shown.length === 1) return;   // 至少留一項
          on ? hiddenParts.add(f) : hiddenParts.delete(f);
          drawStack();
        },
      }, [sw, document.createTextNode(t(k))]);
      b.setAttribute("aria-pressed", String(on));
      return b;
    }));
    stackedBars(stackBox, {
      xs: stackXs, label: t("whStackLabel"), shares: true,
      layers: shown.map(([f, k, c]) => ({ label: t(k), color: cssVar(c), values: stackXs.map((yr) => applyTax(row(re, yr)[f], mode)) })),
      // 四項都在：用官方合計；拿掉幾項：用看得到的項目加總
      totals: stackXs.map((yr) => applyTax(shown.length === PARTS.length ? row(re, yr).total : shown.reduce((sum, [f]) => sum + row(re, yr)[f], 0), mode)),
      format: fix,
    });
  };
  const stackCsv = () => [
    [t("whCols", tax)[0], ...PARTS.map(([, k]) => `${t(k)} (${t("perKwh")}, ${tax})`), `${t("total")} (${t("perKwh")}, ${tax})`],
    ...xs.filter((yr) => row(re, yr)).map((yr) => { const r = row(re, yr); return [yr, ...PARTS.map(([f]) => (r[f] == null ? "" : fix(applyTax(r[f], mode)))), fix(applyTax(r.total, mode))]; }),
  ];
  const stackCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("whStackTitle", tax) }), el("span", { className: "sub", textContent: t("whStackHint") })]),
    toggles, stackBox, docList,
    partialYears.length ? el("p", { className: "note", textContent: t("whPartialYears", years2text(partialYears)) }) : "",
    xs.some((yr) => !row(re, yr)) ? el("p", { className: "note", textContent: t("whGapNote", years2text(xs.filter((yr) => !row(re, yr)))) }) : "",
    el("p", { className: "note", textContent: t("whTaxNote") }),
    cardFoot(src, updated, downloadButton(`taiwan-wheeling-rate-renewable-components-${fileTax(mode)}.csv`, stackCsv)),
  ]);

  // ---- 2. 折線圖：平均 vs 再生能源 ----
  const lineBox = el("div");
  const totalSeries = (list, label, colorVar) => ({
    label, color: cssVar(colorVar),
    values: xs.map((yr) => applyTax(row(list, yr)?.total ?? null, mode)),
    format: (v) => `${fix(v)} ${t("perKwh")}`,
  });
  const lineSeries = [totalSeries(avg, t("whAverage"), "--g4"), totalSeries(re, t("whRe"), "--g7")];
  const lineLegend = legend(lineSeries.map((s) => [s.label, s.color]));
  // 凸顯再生能源費率的上升：從 2022 年（或有資料的最早一年）到最新一年
  const reYears = re.map((r) => r.year);
  const from = row(re, 2022) || row(re, Math.min(...reYears)), to = row(re, Math.max(...reYears));
  const rise = from && to && from !== to
    ? t("whRise", from.year, fix(applyTax(from.total, mode)), to.year, fix(applyTax(to.total, mode)), (to.total / from.total).toFixed(1))
    : "";
  const missing = xs.filter((yr) => !row(re, yr));
  const lineCsv = () => [
    [t("whCols", tax)[0], `${t("whAverage")} (${t("perKwh")}, ${tax})`, `${t("whRe")} (${t("perKwh")}, ${tax})`],
    ...xs.map((yr) => [yr, row(avg, yr) ? fix(applyTax(row(avg, yr).total, mode)) : "", row(re, yr) ? fix(applyTax(row(re, yr).total, mode)) : ""]),
  ];
  const lineCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("whLineTitle", tax) })]),
    lineLegend, lineBox,
    rise ? el("p", { className: "lead", textContent: rise }) : "",
    missing.length ? el("p", { className: "note", textContent: t("whGapNote", years2text(missing)) }) : "",
    cardFoot(src, updated, downloadButton(`taiwan-wheeling-rate-totals-${fileTax(mode)}.csv`, lineCsv)),
  ]);

  // ---- 3. 表格 ----
  const cols = t("whCols", tax);
  const sorted = [...avg, ...re];
  const tableRows = sorted.map((r) => {
    const name = el("td", { className: "c", textContent: r.fuel_type === "average" ? t("whAverage") : t("whRe") });
    return el("tr", {}, [
      el("td", {}, [yearCell(r.year)]), name,
      ...PARTS.map(([f]) => el("td", { textContent: fix(applyTax(r[f], mode)), className: r[f] == null ? "dim" : "" })),
      el("td", { textContent: fix(applyTax(r.total, mode)) }),
    ]);
  });
  const tableCsv = () => [[...cols.map((c, i) => (i >= 2 ? `${c} (${t("perKwh")}, ${tax})` : c))], ...sorted.map((r) => [r.year, r.fuel_type === "average" ? t("whAverage") : t("whRe"),
    ...PARTS.map(([f]) => (r[f] == null ? "" : fix(applyTax(r[f], mode)))), fix(applyTax(r.total, mode))])];
  const tableCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("whTableTitle", tax) })]),
    el("div", { className: "scroll" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, cols.map((c, i) => el("th", { textContent: c, className: i === 1 ? "c" : "" })))]),
      el("tbody", {}, tableRows),
    ])]),
    el("p", { className: "note", textContent: t("whTaxNote") }),
    rates.some((r) => r.ancillary == null) ? el("p", { className: "note", textContent: t("whPartialNote") }) : "",
    cardFoot(src, updated, downloadButton(`taiwan-wheeling-rates-${fileTax(mode)}.csv`, tableCsv)),
  ]);

  // ---- 4. 說明 ----
  const explain = el("section", { className: "card prose" }, [
    el("h3", { textContent: t("whExplainTitle") }),
    el("dl", { className: "deflist" }, t("whExplain").flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })])),
    el("h3", { textContent: t("whWhoPaysTitle") }),
    el("ul", {}, t("whWhoPays").map((s) => el("li", { textContent: s }))),
  ]);

  root.replaceChildren(head, stackCard, lineCard, tableCard, explain);
  requestAnimationFrame(() => {
    drawStack();
    lineChart(lineBox, { xs, series: lineSeries, label: t("whLineLabel") });
  });
}

// 圖例：[[名稱, 顏色, "box"（方塊）或省略（線）], ...]
function legend(items) {
  return el("div", { className: "legend static" }, items.map(([label, color, kind]) => {
    const k = el("i", { className: "k" + (kind === "box" ? " box" : "") });
    k.style.setProperty("--c", color);
    return el("span", { className: "lg" }, [k, document.createTextNode(label)]);
  }));
}
