// 能源類型頁（例如「離岸風電」）：這一類的發電量曲線，和底下每個機組的表格
import { getCategorySeries, getUnitSeries, getDaily } from "../api.js";
import { t, name, locale, taipowerType } from "../i18n.js";
import { el, fmt, pct, mean, taipeiDay, HOURS_PER_POINT } from "../util.js";
import { areaChart, sparkline, statusStrip, STATUS_COLOR } from "../charts.js";
import { catColor, catColorVar, catHatch, latestByCategory, statusLabels, remarkText, categoryByCode } from "../model.js";
import { statTiles, table } from "./overview.js";

let sortKey = "now", sortDir = -1;   // 機組表目前的排序

export async function load(ctx, code) {
  const cat = categoryByCode(ctx.meta, code);
  if (!cat) return null;
  const [series, unitSeries, daily] = await Promise.all([
    getCategorySeries(ctx.fromIso, ctx.toIso, ctx.bucket),
    getUnitSeries(ctx.fromIso, ctx.toIso, { categoryId: cat.id }),
    getDaily(taipeiDay(new Date(ctx.from)), taipeiDay(new Date(ctx.to)), { categoryId: cat.id }),
  ]);
  return { cat, series, unitSeries, daily };
}

export function render(root, ctx, data) {
  const { meta } = ctx, { cat, series, unitSeries, daily } = data;
  const L = latestByCategory(meta)[cat.id];
  const s = series.series[cat.id] || { output: [], cf: [] };
  const energyMwh = s.output.reduce((sum, v) => sum + (v || 0), 0) * HOURS_PER_POINT[series.bucket];

  const head = el("div", { className: "pagehead" }, [
    crumbs([[t("navOverview"), "#"], [name(cat)]]),
    el("h2", { className: "pagetitle" }, [swatch(cat), document.createTextNode(name(cat))]),
  ]);

  const stats = statTiles([
    [t("statNow"), fmt(L.now), "MW", t("statTotalNote", L.units)],
    [t("statCapacity"), fmt(L.cap), "MW", t("statCapacityNote", L.withCap, L.units)],
    [t("statCf"), pct(mean(s.cf)), "", t("statCfNote")],
    [t("statEnergy"), fmt(energyMwh / t("energyUnit")), t("energyLabel"), periodText(ctx)],
  ]);

  const chartBox = el("div");
  const chartCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("catChartTitle", name(cat)) })]),
    chartBox,
    el("p", { className: "note", textContent: t("catNote2") })]);

  root.replaceChildren(head, stats, chartCard, unitsCard(ctx, cat, unitSeries, daily));
  areaChart(chartBox, {
    times: series.times, bucket: series.bucket, from: ctx.from, values: s.output,
    color: getComputedStyle(document.documentElement).getPropertyValue(catColorVar(cat)).trim(),
    hatch: catHatch(cat), label: t("output"), capacity: L.cap || null,
    tipRows: (i) => [[t("cf"), pct(s.cf[i])]],
  });
}

// ---- 機組表 ----
function unitsCard(ctx, cat, unitSeries, daily) {
  const { meta } = ctx;
  // 期間容量因數：把每日的容量因數依「當天有幾個時間點」加權平均
  const cfByUnit = {};
  daily.forEach((d) => {
    if (d.capacity_factor == null) return;
    const c = (cfByUnit[d.unit_id] ||= { sum: 0, n: 0 });
    c.sum += d.capacity_factor * d.intervals_present;
    c.n += d.intervals_present;
  });
  const card = el("section", { className: "card" });

  const draw = () => {
    const rows = meta.units.filter((u) => u.category_id === cat.id).map((u) => ({
      u, name: name(u), cap: u.capacity_mw, now: u.output_mw,
      cf: cfByUnit[u.id] ? cfByUnit[u.id].sum / cfByUnit[u.id].n : null,
      s: unitSeries.units[u.id] || { output: [], status: [], remark: [] },
    }));
    rows.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y, locale()) : x - y) * sortDir;
    });
    const trs = rows.map((r) => {
      const href = `#unit-${r.u.id}`;
      const nameCell = el("td", {}, [el("a", { href, textContent: r.name })]);
      if (cat.code === "other_thermal") nameCell.append(el("span", { className: "dim", textContent: "　" + taipowerType(r.u.type) }));
      const tr = el("tr", { tabIndex: 0 }, [
        nameCell,
        el("td", { textContent: fmt(r.cap, 1), className: r.cap == null ? "dim" : "" }),
        el("td", { textContent: fmt(r.now, 1) }),
        el("td", { textContent: pct(r.cf), className: r.cf == null ? "dim" : "" }),
        el("td", { className: "c" }, [sparkline(r.s.output, r.cap)]),
        el("td", { className: "c" }, [statusStrip(r.s.status, statusLabels(meta, r.s.status, r.s.remark, t("noData")), unitSeries.times)]),
        el("td", { className: "c", textContent: r.u.remark ? remarkText(meta, r.u.remark) : "—" }),
      ]);
      tr.onclick = (e) => { if (e.target.tagName !== "A") location.hash = href; };
      tr.onkeydown = (e) => { if (e.key === "Enter") location.hash = href; };
      return tr;
    });

    const cols = [["name", t("colUnit")], ["cap", t("colCapacity")], ["now", t("colNow")], ["cf", t("colUnitCf")]];
    const ths = cols.map(([k, label]) => {
      const th = el("th", { className: "sortable", textContent: label, tabIndex: 0 });
      th.setAttribute("aria-sort", k === sortKey ? (sortDir < 0 ? "descending" : "ascending") : "none");
      const go = () => {
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === "name" ? 1 : -1; }
        draw();
      };
      th.onclick = go;
      th.onkeydown = (e) => { if (e.key === "Enter") go(); };
      return th;
    });
    const thead = el("thead", {}, [el("tr", {}, [...ths,
      el("th", { className: "c", textContent: t("colTrend") }), el("th", { className: "c", textContent: t("colStatus") }), el("th", { className: "c", textContent: t("colRemark") })])]);

    card.replaceChildren(
      el("div", { className: "cardhead" }, [el("h2", { textContent: t("unitTitle") }), el("span", { className: "sub", textContent: t("unitHint") })]),
      el("div", { className: "scroll" }, [el("table", {}, [thead, el("tbody", {}, trs)])]),
      statusKey(meta),
      el("p", { className: "note", textContent: t("unitNote") }));
  };
  draw();
  return card;
}

// ---- 這幾個小工具，機組頁也會用到 ----

// 麵包屑：總覽 › 離岸風電 › 沃一風
export function crumbs(items) {
  const nav = el("nav", { className: "crumbs" });
  nav.setAttribute("aria-label", "breadcrumb");
  items.forEach(([label, href], i) => {
    if (i) nav.append(el("span", { className: "sep", textContent: "›" }));
    nav.append(href ? el("a", { href, textContent: label }) : el("span", { textContent: label }));
  });
  return nav;
}

export function swatch(cat) {
  const sw = el("i", { className: "sw" + (catHatch(cat) ? " hatch" : "") });
  sw.style.backgroundColor = catColor(cat);
  return sw;
}

// 狀態色帶的圖例
export function statusKey(meta) {
  const nameOf = (id) => meta.statuses.find((s) => s.id === id);
  return el("div", { className: "key" }, meta.statuses.filter((s) => s.id !== 5).map((s) => {
    const i = el("i");
    i.style.background = `var(${STATUS_COLOR[s.id]})`;
    return el("span", {}, [i, document.createTextNode(s.id === 6 ? `${name(s)} / ${name(nameOf(5))}` : name(s))]);
  }));
}

export const periodText = (ctx) => t("statEnergyNote", ctx.fromLabel, ctx.toLabel);
