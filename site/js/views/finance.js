// 業者小檔案頁的「財務分析（推估）」區塊（第 3 階段）
//
//   資料：api_company 的 financials（一份年報一列，見 supabase/migrations/020_company_financials.sql）
//   版面：
//     1. 依據的報告：每一年的年報連結（點了開原檔）
//     2. 年度切換：整體平均／各年度
//     3. 重點數字卡：每個數字底下寫「怎麼算出來的」
//     4. 圖：每度電單價的趨勢、逐年電量
//     5. 逐年明細表：原始數字、單價、狀態、來源（年報＋頁碼）；點某一年＝切換到那一年
//     6. 怎麼算的（可以展開）＋ CSV 下載
//   沒有資料的業者：寫出每一年為什麼沒有（遮蔽、沒附收支表、讀不到、沒有年報）。
//
// 整體平均：只用「算得出單價、而且沒有特殊情況（flags）」的年度，各項先加總再相除（等於依電量加權）。

import { t, getLang } from "../i18n.js";
import { el, cssVar, fmt } from "../util.js";
import { lineChart, stackedBars } from "../charts.js";
import { downloadButton, cardFoot } from "../download.js";

let selected = "all";        // 目前選的年度（"all"＝整體平均）
let lastCompany = null;

const n = (v) => (v == null || v === "" ? null : Number(v));
const en = () => getLang() === "en";
// 加總；所有年度都沒有這個數字時回傳 null（顯示「—」，不是 0）
const sum = (rows, k) => (rows.some((r) => n(r[k]) != null) ? rows.reduce((s, r) => s + (n(r[k]) ?? 0), 0) : null);
const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);

// ---- 數字格式：中文用「萬度／億元」，英文用 GWh、NT$ m ----
export const kwhText = (v) => {
  if (v == null) return "—";
  if (en()) return Math.abs(v) >= 1e6 ? `${fmt(v / 1e6, 1)} GWh` : Math.abs(v) >= 1e3 ? `${fmt(v / 1e3, 0)} MWh` : `${fmt(v, 0)} kWh`;
  return Math.abs(v) >= 1e8 ? `${fmt(v / 1e8, 2)} 億度` : Math.abs(v) >= 1e4 ? `${fmt(v / 1e4, 0)} 萬度` : `${fmt(v, 0)} 度`;
};
export const moneyText = (v) => {
  if (v == null) return "—";
  if (en()) return Math.abs(v) >= 1e6 ? `NT$${fmt(v / 1e6, 1)}m` : `NT$${fmt(v, 0)}`;
  return Math.abs(v) >= 1e8 ? `${fmt(v / 1e8, 2)} 億元` : Math.abs(v) >= 1e4 ? `${fmt(v / 1e4, 0)} 萬元` : `${fmt(v, 0)} 元`;
};
const priceText = (v) => (v == null ? "—" : `${fmt(v, 2)} ${t("fin").perKwh}`);
const pctText = (v, d = 1) => (v == null ? "—" : `${fmt(v * 100, d)}%`);
const csvNum = (v, d = 0) => (v == null ? "" : Number(v).toFixed(d));

// 營業收入 ≥ 電業收入；有些報告營業收入那一列寫「-」或空白，所以取較大的（和 view 一樣）
const revBase = (r) => {
  const a = n(r.operating_revenue), b = n(r.electricity_revenue);
  return a == null ? b : b == null ? a : Math.max(a, b);
};
const flagged = (r) => (r.flags || []).length > 0;
const usable = (r) => r.status === "complete" && !flagged(r);

// 一組年度合起來的指標（加總再相除）
function metrics(rows, role) {
  if (!rows.length) return null;
  const ER = sum(rows, "electricity_revenue"), OC = sum(rows, "operating_cost"), OE = sum(rows, "operating_expense");
  const withOp = rows.filter((r) => r.operating_income != null);
  const opMargin = withOp.length ? div(sum(withOp, "operating_income"), withOp.reduce((s, r) => s + (revBase(r) ?? 0), 0)) : null;
  if (role === "retailer") {
    const S = sum(rows, "sold_kwh"), P = sum(rows, "purchased_kwh");
    const sale = div(ER, S), cost = div(OC, P);
    return { S, P, ER, OC, OE, sale, cost, spread: sale != null && cost != null ? sale - cost : null, exp: div(OE, S), opMargin };
  }
  const G = sum(rows, "gross_generation_kwh"), T = sum(rows, "sold_total");
  const cfs = rows.map((r) => n(r.capacity_factor_pct)).filter((v) => v != null);
  const rev = div(ER, T), cost = div(OC, T);
  return { G, T, ER, OC, OE, rev, cost, margin: rev != null && cost != null ? rev - cost : null, opMargin,
    cf: cfs.length ? cfs.reduce((a, b) => a + b, 0) / cfs.length : null };
}

// 年份清單，例如「2022–2025」或「2023、2025」
const yearsText = (ys) => {
  if (!ys.length) return "—";
  const contiguous = ys.every((y, i) => !i || y === ys[i - 1] + 1);
  return contiguous && ys.length > 2 ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(t("listSep"));
};

export function financeCard(c, d, rerender) {
  const F = t("fin");
  const role = c.role;
  const rows = [...(d.financials || [])].sort((a, b) => a.year - b.year);
  if (lastCompany !== c.id) { selected = "all"; lastCompany = c.id; }
  const card = el("section", { className: "card fin" });
  const head = el("div", { className: "cardhead" }, [el("h2", { textContent: F.title })]);
  card.append(head);

  // ---- 沒有任何年報 ----
  if (!rows.length) {
    card.append(noData(c, d, F));
    return card;
  }

  // ---- 1. 依據的報告 ----
  const srcRow = el("div", { className: "fin-src" }, [el("span", { className: "dim", textContent: F.basedOn })]);
  rows.forEach((r) => {
    const label = F.annualOf(r.year);
    const kids = [el("i", { className: `dot st-${r.status}` }), document.createTextNode(label)];
    srcRow.append(r.report_url && r.status !== "missing"
      ? el("a", { className: "chip src", href: r.report_url, target: "_blank", rel: "noopener", title: F.status[r.status] }, kids)
      : el("span", { className: "chip src off", title: F.status[r.status] }, kids));
  });
  srcRow.append(el("span", { className: "dim small", textContent: F.monthlyNotYet }));
  card.append(srcRow);

  // 用哪幾年算整體平均
  const good = rows.filter(usable);
  const fee = rows.filter((r) => r.status === "complete" && (r.flags || []).includes("fee"));
  const feeOnly = !good.length && fee.length > 0;       // 只有「可能只是服務費」的年度
  const avgRows = feeOnly ? fee : good;
  // 沒有算得出單價的年度：數字卡還是顯示電量（用所有讀得到的年度），單價顯示「—」並寫原因
  const volRows = avgRows.length ? avgRows : rows.filter((r) => r.status !== "missing");

  // ---- 2. 年度切換 ----
  const keys = ["all", ...rows.map((r) => r.year)];
  if (!keys.includes(selected)) selected = "all";
  const seg = el("div", { className: "seg fin-seg", role: "group", "aria-label": F.pickYear }, keys.map((k) => {
    const b = el("button", { type: "button", textContent: k === "all" ? F.overall : String(k), onclick: () => { selected = k; rerender(); } });
    b.setAttribute("aria-pressed", String(selected === k));
    return b;
  }));
  card.append(el("div", { className: "fin-bar" }, [seg]));

  // ---- 提醒（沒有可用年度、只有服務費、特殊情況）----
  const sel = selected === "all" ? null : rows.find((r) => r.year === selected);
  const banners = [];
  if (!good.length && !feeOnly) banners.push(["warn", F.noUsable(reasonSummary(rows, F))]);
  if (feeOnly || (sel && (sel.flags || []).includes("fee"))) banners.push(["warn", F.feeBanner]);
  if (sel) {
    if (sel.status !== "complete") banners.push(["info", `${F.annualOf(sel.year)}${t("colon")}${F.status[sel.status]}${sel.note ? t("colon") + sel.note : ""}`]);
    (sel.flags || []).filter((f) => f !== "fee").forEach((f) => banners.push(["warn", `${F.flag[f]}${t("colon")}${sel.note || ""}`]));
  }
  banners.forEach(([kind, text]) => card.append(el("p", { className: `banner ${kind}`, textContent: text })));

  // ---- 3. 重點數字卡 ----
  const m = sel ? metrics([sel], role) : metrics(volRows, role);
  const scopeText = sel ? F.annualOf(sel.year)
    : avgRows.length ? F.avgScope(yearsText(avgRows.map((r) => r.year)), avgRows.length)
    : volRows.length ? F.volScope(yearsText(volRows.map((r) => r.year))) : "—";
  card.append(el("p", { className: "fin-scope", textContent: scopeText }));
  const noPrice = sel ? sel.status !== "complete" : !avgRows.length;
  // 沒有單價的原因：全部遮蔽／全部沒附收支表時寫得具體一點
  const sts = new Set(volRows.map((r) => r.status));
  const whyAll = sts.size === 1 && sts.has("masked") ? F.noPriceMasked : sts.size === 1 && sts.has("no_fin") ? F.noPriceNoFin : F.noPriceAll;
  card.append(tiles(m, role, F, feeOnly || (sel && (sel.flags || []).includes("fee")), sel, noPrice ? (sel ? F.status[sel.status] : whyAll) : null));

  // ---- 4. 圖 ----
  const xs = rows.map((r) => r.year);
  const charts = el("div", { className: "fin-charts" });
  const priceBox = el("div"), volBox = el("div");
  charts.append(
    el("div", {}, [el("h3", { textContent: role === "retailer" ? (feeOnly ? F.tFeeRev : F.chartPrice) : F.chartRevenue }), legendFor(role, F, feeOnly), priceBox]),
    el("div", {}, [el("h3", { textContent: role === "retailer" ? F.chartVolume : F.chartGen }), volLegend(role, F), volBox]),
  );
  card.append(charts, el("p", { className: "note", textContent: F.hollowNote }));

  // ---- 5. 逐年明細表 ----
  card.append(yearTable(rows, role, F, avgRows, rerender));

  // 備註（每一年要注意的地方）
  const noted = rows.filter((r) => r.note);
  if (noted.length) {
    card.append(el("details", { className: "collapse fin-notes" }, [
      el("summary", {}, [el("span", { textContent: F.notesTitle(noted.length) })]),
      el("ul", {}, noted.map((r) => el("li", {}, [el("b", { textContent: `${r.year}${t("colon")}` }), document.createTextNode(r.note)]))),
    ]));
  }

  // ---- 6. 怎麼算的 ----
  card.append(el("details", { className: "collapse fin-how" }, [
    el("summary", {}, [el("span", { textContent: F.howTitle })]),
    el("ul", {}, (role === "retailer" ? F.howRetail : F.howGen).map((s) => el("li", { textContent: s }))),
  ]));

  const slug = `company-${c.id}-finance`;
  card.append(cardFoot(rows.filter((r) => r.report_url && r.status !== "missing").map((r) => [F.annualOf(r.year), r.report_url]), F.compiledOn,
    downloadButton(`taiwan-renewable-${slug}.csv`, () => csvRows(rows, role, F))));

  requestAnimationFrame(() => drawCharts(priceBox, volBox, rows, xs, role, F, feeOnly));
  return card;
}

// ---------------------------------------------------------------------
function tiles(m, role, F, isFee, sel, noPrice) {
  const box = el("div", { className: "stats fin-tiles" });
  const tile = (label, value, formula, tone) => box.append(el("div", { className: `stat ${tone || ""}` }, [
    el("div", { className: "l", textContent: label }),
    el("div", { className: "v", textContent: value }),
    el("div", { className: "n", textContent: formula }),
  ]));
  if (!m) {
    tile(F.tileNone, "—", "");
    return box;
  }
  if (role === "retailer") {
    tile(sel ? F.tSold : F.tSold + F.sumSuffix, kwhText(m.S), F.fPurchased(kwhText(m.P)));
    tile(isFee ? F.tFeeRev : F.tSale, priceText(m.sale), noPrice && m.sale == null ? noPrice : F.fDiv(moneyText(m.ER), F.wElecRev, kwhText(m.S), F.wSold), isFee ? "warn" : "");
    tile(F.tCost, isFee ? "—" : priceText(m.cost), isFee ? F.feeCost : noPrice && m.cost == null ? noPrice : F.fDiv(moneyText(m.OC), F.wCost, kwhText(m.P), F.wPurchased));
    tile(F.tSpread, isFee ? "—" : priceText(m.spread), isFee ? "" : m.spread == null && noPrice ? noPrice : F.fSpread(m.exp == null ? "—" : fmt(m.exp, 2)), m.spread != null && !isFee ? (m.spread >= 0 ? "pos" : "neg") : "");
    tile(F.tMargin, pctText(m.opMargin), m.opMargin == null && noPrice ? noPrice : F.fMargin, m.opMargin != null ? (m.opMargin >= 0 ? "pos" : "neg") : "");
  } else {
    tile(sel ? F.tGen : F.tGen + F.sumSuffix, kwhText(m.G), F.fSoldTotal(kwhText(m.T)));
    tile(F.tCf, m.cf == null ? "—" : `${fmt(m.cf, 1)}%`, sel ? F.fCfYear : F.fCfAvg);
    tile(F.tRev, priceText(m.rev), noPrice && m.rev == null ? noPrice : F.fDiv(moneyText(m.ER), F.wElecRev, kwhText(m.T), F.wSoldTotal));
    tile(F.tGenCost, priceText(m.cost), noPrice && m.cost == null ? noPrice : F.fDiv(moneyText(m.OC), F.wCost, kwhText(m.T), F.wSoldTotal));
    tile(F.tMargin, pctText(m.opMargin), m.opMargin == null && noPrice ? noPrice : F.fMargin, m.opMargin != null ? (m.opMargin >= 0 ? "pos" : "neg") : "");
  }
  return box;
}

function legendFor(role, F, feeOnly) {
  const items = role === "retailer"
    ? [[feeOnly ? F.tFeeRev : F.tSale, "--g4"], ...(feeOnly ? [] : [[F.tCost, "--g2"]])]
    : [[F.tRev, "--g4"], [F.tGenCost, "--g2"]];
  return el("div", { className: "legend static" }, items.map(([label, c]) => {
    const k = el("i", { className: "k" }); k.style.setProperty("--c", cssVar(c));
    return el("span", { className: "lg" }, [k, document.createTextNode(label)]);
  }));
}
function volLegend(role, F) {
  const items = role === "retailer" ? [[F.tSold, "--g3"]] : [[F.chTp, "--g6"], [F.chRe, "--g1"], [F.chUs, "--g3"]];
  return el("div", { className: "legend static" }, items.map(([label, c]) => {
    const k = el("i", { className: "k box" }); k.style.setProperty("--c", cssVar(c));
    return el("span", { className: "lg" }, [k, document.createTextNode(label)]);
  }));
}

function drawCharts(priceBox, volBox, rows, xs, role, F, feeOnly) {
  // 每度電單價：可用年度畫實心點；有特殊情況的畫空心點（不納入平均）；服務費年度只在「只有服務費」時畫
  const showRow = (r) => r.status === "complete" && (feeOnly || !(r.flags || []).includes("fee"));
  const hollow = new Set(rows.map((r, i) => (flagged(r) && !feeOnly ? i : -1)).filter((i) => i >= 0));
  const pick = (k) => rows.map((r) => (showRow(r) ? n(r[k]) : null));
  const series = role === "retailer"
    ? [{ label: feeOnly ? F.tFeeRev : F.tSale, color: cssVar("--g4"), values: pick("sale_price"), hollow, format: (v) => priceText(v) },
       ...(feeOnly ? [] : [{ label: F.tCost, color: cssVar("--g2"), values: pick("purchase_cost"), hollow, format: (v) => priceText(v) }])]
    : [{ label: F.tRev, color: cssVar("--g4"), values: pick("revenue_per_kwh"), hollow, format: (v) => priceText(v) },
       { label: F.tGenCost, color: cssVar("--g2"), values: pick("cost_per_kwh"), hollow, format: (v) => priceText(v) }];
  if (series.some((s) => s.values.some((v) => v != null))) lineChart(priceBox, { xs, series, label: F.chartPrice });
  else priceBox.append(el("p", { className: "dim empty", textContent: F.noChart }));

  // 逐年電量
  if (role === "retailer") {
    // 圖上用「百萬度」（縱軸刻度才不會太大），提示框再換回萬度／億度
    const vals = rows.map((r) => (n(r.sold_kwh) == null ? null : n(r.sold_kwh) / 1e6));
    if (vals.some((v) => v != null)) stackedBars(volBox, { xs, layers: [{ label: F.tSold, color: cssVar("--g3"), values: vals }], totals: vals, label: F.chartVolume, format: (v) => kwhText(v * 1e6) });
    else volBox.append(el("p", { className: "dim empty", textContent: F.noChart }));
  } else {
    const layers = [["sold_to_taipower_kwh", F.chTp, "--g6"], ["sold_to_retailers_kwh", F.chRe, "--g1"], ["sold_to_users_kwh", F.chUs, "--g3"]]
      .map(([k, label, c]) => ({ label, color: cssVar(c), values: rows.map((r) => (n(r[k]) == null ? null : n(r[k]) / 1e6)) }));
    const totals = rows.map((r, i) => (layers.some((l) => l.values[i] != null) ? layers.reduce((s, l) => s + (l.values[i] ?? 0), 0) : null));
    if (totals.some((v) => v != null)) stackedBars(volBox, { xs, layers, totals, label: F.chartGen, format: (v) => kwhText(v * 1e6), shares: true });
    else volBox.append(el("p", { className: "dim empty", textContent: F.noChart }));
  }
}

// ---------------------------------------------------------------------
function yearTable(rows, role, F, avgRows, rerender) {
  const cols = role === "retailer" ? F.colsRetail : F.colsGen;
  const srcCell = (r) => {
    const kids = [];
    if (r.report_url && r.status !== "missing") kids.push(el("a", { href: r.report_url, target: "_blank", rel: "noopener", textContent: F.annualOf(r.year) + " ↗" }));
    else kids.push(document.createTextNode(F.annualOf(r.year)));
    if (r.pages) kids.push(el("div", { className: "dim small", textContent: r.pages }));
    if (r.source === "html") kids.push(el("div", { className: "dim small", textContent: F.htmlSource }));
    return el("td", { className: "c src" }, kids);
  };
  const statusCell = (r) => el("td", { className: "c" }, [
    el("span", { className: `pill st-${r.status}`, textContent: F.status[r.status] }),
    ...(r.flags || []).map((f) => el("span", { className: "pill flag", textContent: F.flag[f], title: r.note || "" })),
  ]);
  const cell = (v, cls = "") => el("td", { className: cls, textContent: v });
  const body = rows.map((r) => {
    const isFee = (r.flags || []).includes("fee");
    const cells = role === "retailer" ? [
      cell(kwhText(n(r.sold_kwh))), cell(kwhText(n(r.purchased_kwh))), cell(moneyText(n(r.electricity_revenue))),
      cell(moneyText(n(r.operating_cost))), cell(moneyText(n(r.operating_expense))),
      cell(priceText(n(r.sale_price)), isFee ? "warnc" : ""), cell(isFee ? "—" : priceText(n(r.purchase_cost))),
      cell(isFee ? "—" : priceText(n(r.spread))), cell(pctText(div(n(r.operating_income), revBase(r)))),
    ] : [
      cell(n(r.capacity_kw) == null ? "—" : `${fmt(n(r.capacity_kw) / 1000, 1)} MW`), cell(kwhText(n(r.gross_generation_kwh))),
      cell(kwhText(n(r.sold_total))), cell(r.capacity_factor_pct == null ? "—" : `${fmt(n(r.capacity_factor_pct), 1)}%`),
      cell(moneyText(n(r.electricity_revenue))), cell(moneyText(n(r.operating_cost))),
      cell(priceText(n(r.revenue_per_kwh))), cell(priceText(n(r.cost_per_kwh))), cell(pctText(div(n(r.operating_income), revBase(r)))),
    ];
    const tr = el("tr", { className: selected === r.year ? "sel" : "", tabIndex: 0, title: F.rowHint }, [el("th", { className: "c", textContent: String(r.year) }), statusCell(r), ...cells, srcCell(r)]);
    const pickRow = () => { selected = selected === r.year ? "all" : r.year; rerender(); };
    tr.onclick = (e) => { if (!e.target.closest("a")) pickRow(); };
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickRow(); } };
    return tr;
  });
  // 最後一列：整體平均
  const m = metrics(avgRows, role);
  if (m) {
    const avgCells = role === "retailer"
      ? [cell(kwhText(m.S)), cell(kwhText(m.P)), cell(moneyText(m.ER)), cell(moneyText(m.OC)), cell(moneyText(m.OE)), cell(priceText(m.sale)), cell(priceText(m.cost)), cell(priceText(m.spread)), cell(pctText(m.opMargin))]
      : [cell("—"), cell(kwhText(m.G)), cell(kwhText(m.T)), cell(m.cf == null ? "—" : `${fmt(m.cf, 1)}%`), cell(moneyText(m.ER)), cell(moneyText(m.OC)), cell(priceText(m.rev)), cell(priceText(m.cost)), cell(pctText(m.opMargin))];
    body.push(el("tr", { className: `avg ${selected === "all" ? "sel" : ""}` }, [
      el("th", { className: "c", textContent: F.overall }), el("td", { className: "c dim small", textContent: yearsText(avgRows.map((r) => r.year)) }), ...avgCells, el("td", { className: "c dim small", textContent: F.weighted }),
    ]));
  }
  return el("div", { className: "scroll fin-table" }, [el("table", {}, [
    el("thead", {}, [el("tr", {}, cols.map((h, i) => el("th", { className: i < 2 || i === cols.length - 1 ? "c" : "", textContent: h })))]),
    el("tbody", {}, body),
  ])]);
}

// 每一年為什麼不能算（給沒有可用年度的業者）
function reasonSummary(rows, F) {
  return rows.map((r) => `${r.year} ${F.status[r.status]}`).join(t("listSep"));
}

// 完全沒有年報的業者：說明原因
function noData(c, d, F) {
  const reports = d.reports || [];
  const monthly = reports.filter((r) => r.report_type === "monthly" && r.status === "found" && r.year && r.month);
  const nf = reports.find((r) => r.status === "not_found" && !r.year);
  const items = [];
  if (nf) items.push(nf.note || F.status.missing);
  else items.push(F.noAnnual);
  if (monthly.length) {
    const ms = monthly.map((r) => r.year * 100 + r.month).sort((a, b) => a - b);
    const ym = (v) => `${Math.floor(v / 100)}-${String(v % 100).padStart(2, "0")}`;
    items.push(F.hasMonthly(monthly.length, ym(ms[0]), ym(ms[ms.length - 1])));
  }
  return el("div", {}, [
    el("p", { className: "banner info", textContent: F.noDataTitle }),
    el("ul", { className: "fin-why" }, items.map((s) => el("li", { textContent: s }))),
    c.disclosure_url ? el("p", { className: "note" }, [document.createTextNode(F.seeDisclosure), el("a", { href: c.disclosure_url, target: "_blank", rel: "noopener", textContent: c.disclosure_url })]) : "",
  ]);
}

function csvRows(rows, role, F) {
  const H = role === "retailer"
    ? ["year", "status", "flags", "sold_kwh", "purchased_kwh", "operating_revenue", "electricity_revenue", "operating_cost", "operating_expense", "sale_price_per_kwh", "purchase_cost_per_kwh", "spread_per_kwh", "operating_income", "report_url", "pages", "note"]
    : ["year", "status", "flags", "capacity_kw", "gross_generation_kwh", "net_generation_kwh", "sold_to_taipower_kwh", "sold_to_retailers_kwh", "sold_to_users_kwh", "capacity_factor_pct", "operating_revenue", "electricity_revenue", "operating_cost", "operating_expense", "revenue_per_kwh", "cost_per_kwh", "operating_income", "report_url", "pages", "note"];
  const label = (k) => (F.csvHead[k] || k);
  const out = [H.map(label)];
  rows.forEach((r) => {
    const v = { ...r, status: F.status[r.status], flags: (r.flags || []).map((f) => F.flag[f]).join(t("listSep")),
      sale_price_per_kwh: csvNum(r.sale_price, 4), purchase_cost_per_kwh: csvNum(r.purchase_cost, 4), spread_per_kwh: csvNum(r.spread, 4),
      revenue_per_kwh: csvNum(r.revenue_per_kwh, 4), cost_per_kwh: csvNum(r.cost_per_kwh, 4) };
    out.push(H.map((k) => (v[k] == null ? "" : String(v[k]))));
  });
  return out;
}
