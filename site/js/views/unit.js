// 機組頁（例如「沃一風」）：發電量曲線、和時間軸對齊的狀態色帶、每日紀錄
import { getUnitSeries, getDaily } from "../api.js";
import { t, name, taipowerType } from "../i18n.js";
import { el, fmt, pct, taipeiDay, HOURS_PER_POINT } from "../util.js";
import { areaChart } from "../charts.js";
import { catColorVar, catHatch, categoryById, unitById, statusLabels, statusName, remarkText } from "../model.js";
import { statTiles, table } from "./overview.js";
import { crumbs, swatch, statusKey, periodText } from "./category.js";

// 狀態「狀態不明」(5)、「試運轉」(6) 的時間點不算容量因數（和資料庫的 statuses.excluded_from_stats 一致）
const EXCLUDED = new Set([5, 6]);

export async function load(ctx, id) {
  const unit = unitById(ctx.meta, id);
  if (!unit) return null;
  const [series, daily] = await Promise.all([
    getUnitSeries(ctx.fromIso, ctx.toIso, { unitId: unit.id }),
    // 每日紀錄：從有資料的第一天到今天（最多 5 年）
    getDaily(ctx.meta.earliest.slice(0, 10), taipeiDay(new Date(ctx.to)), { unitId: unit.id }),
  ]);
  return { unit, series, daily };
}

export function render(root, ctx, data) {
  const { meta } = ctx, { unit, series, daily } = data;
  const cat = categoryById(meta, unit.category_id);
  const s = series.units[unit.id] || { output: [], status: [], remark: [] };
  const labels = statusLabels(meta, s.status, s.remark, t("noData"));
  const cap = unit.capacity_mw;

  // 期間容量因數：期間內每天的容量因數，依當天的時間點數加權平均
  const fromDay = taipeiDay(new Date(ctx.from));
  let cfSum = 0, cfN = 0;
  daily.forEach((d) => {
    if (d.day >= fromDay && d.capacity_factor != null) { cfSum += d.capacity_factor * d.intervals_present; cfN += d.intervals_present; }
  });
  const energyMwh = s.output.reduce((sum, v) => sum + (v || 0), 0) * HOURS_PER_POINT["10min"];
  const nowLabel = unit.remark ? remarkText(meta, unit.remark) : statusName(meta, unit.status_id) || "—";

  const altName = name(unit) === unit.name_zh ? unit.name_en : unit.name_zh;
  const head = el("div", { className: "pagehead" }, [
    crumbs([[t("navOverview"), "#"], [name(cat), `#category-${cat.code}`], [name(unit)]]),
    el("h2", { className: "pagetitle" }, [swatch(cat), document.createTextNode(name(unit)),
      altName ? el("span", { className: "sub", textContent: altName }) : ""]),
    el("p", { className: "sub", textContent: t("unitMeta", name(cat), taipowerType(unit.type)) }),
  ]);

  const stats = statTiles([
    [t("statNow"), fmt(unit.output_mw, 1), "MW", cap ? `${t("cf")} ${pct(Math.max(0, Math.min(1, (unit.output_mw || 0) / cap)))}` : ""],
    [t("statCapacity"), cap ? fmt(cap, 1) : "—", cap ? "MW" : "", cap ? "" : t("noCapacity")],
    [t("statCf"), pct(cfN ? cfSum / cfN : null), "", periodText(ctx)],
    [t("statStatus"), nowLabel, "", unit.remark ? t("statStatusNote", statusName(meta, unit.status_id)) : ""],
  ]);

  const chartBox = el("div");
  const chartCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("unitChartTitle") }),
      el("span", { className: "sub", textContent: `${t("statEnergy")} ${fmt(energyMwh / t("energyUnit"))} ${t("energyLabel")}` })]),
    chartBox,
    statusKey(meta)]);

  // 每日紀錄：新的在上面
  const rows = [...daily].reverse().map((d) => {
    const flags = Object.entries(d.flagged_remarks || {}).map(([r, n]) => `${remarkText(meta, r)} ${t("times", n)}`).join("、");
    return el("tr", {}, [
      el("td", { textContent: d.day }),
      el("td", { textContent: fmt(d.generation_kwh / 1000 / t("energyUnit")) }),
      el("td", { textContent: pct(d.capacity_factor), className: d.capacity_factor == null ? "dim" : "" }),
      el("td", { textContent: pct(d.intervals_present / 144) }),
      el("td", { className: "c", textContent: flags || "—" }),
    ]);
  });
  const dailyCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("dailyTitle") })]),
    table([t("colDay"), t("colDayEnergy"), t("cf"), t("colCompleteness"), [t("colFlags"), "c"]], rows),
    el("p", { className: "note", textContent: t("dailyNote") })]);

  root.replaceChildren(head, stats, chartCard, dailyCard);
  areaChart(chartBox, {
    times: series.times, bucket: "10min", from: ctx.from, values: s.output,
    color: getComputedStyle(document.documentElement).getPropertyValue(catColorVar(cat)).trim(),
    hatch: catHatch(cat), label: t("output"), capacity: cap,
    band: { statuses: s.status, labels },
    tipRows: (i) => {
      const rows = [[t("colStatus"), labels[i] || "—"]];
      if (cap && s.output[i] != null && s.status[i] && !EXCLUDED.has(s.status[i])) {
        rows.unshift([t("cf"), pct(Math.max(0, Math.min(1, s.output[i] / cap)))]);
      }
      return rows;
    },
  });
}
