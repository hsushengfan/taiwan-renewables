// 總覽頁：四個重點數字、各能源堆疊面積圖、能源類型表（點一列進入該類型的頁面）
import { getCategorySeries } from "../api.js";
import { t, name } from "../i18n.js";
import { el, fmt, pct, mean, HOURS_PER_POINT } from "../util.js";
import { stackedChart } from "../charts.js";
import { catColor, catHatch, catColorVar, latestByCategory } from "../model.js";

const hidden = new Set();   // 圖上被隱藏的分類（換頁回來時保留）

export async function load(ctx) {
  return { series: await getCategorySeries(ctx.fromIso, ctx.toIso, ctx.bucket) };
}

export function render(root, ctx, data) {
  const { meta } = ctx, { series } = data;
  const latest = latestByCategory(meta);

  // ---- 四個重點數字 ----
  const byCode = Object.fromEntries(meta.categories.map((c) => [c.code, Math.max(0, latest[c.id].now)]));
  const total = Object.values(byCode).reduce((s, v) => s + v, 0);
  const renewable = meta.categories.filter((c) => c.is_renewable).reduce((s, c) => s + byCode[c.code], 0);
  const solarId = meta.categories.find((c) => c.code === "solar").id;
  const solarPeak = Math.max(0, ...(series.series[solarId]?.output || []).map((v) => v || 0));
  const stats = statTiles([
    [t("statTotal"), fmt(total), "MW", t("statTotalNote", meta.units.length)],
    [t("statRenewable"), total ? ((renewable / total) * 100).toFixed(1) : "—", "%", t("statRenewableNote", fmt(renewable))],
    [t("statWind"), fmt(byCode.wind_offshore + byCode.wind_onshore), "MW", t("statWindNote", fmt(byCode.wind_offshore), fmt(byCode.wind_onshore))],
    [t("statSolar"), fmt(byCode.solar), "MW", byCode.solar < 1 ? t("statSolarNight") : t("statSolarPeak", fmt(solarPeak))],
  ]);

  // ---- 堆疊面積圖 ----
  const chartBox = el("div");
  const legend = el("div", { className: "legend" });
  legend.setAttribute("aria-label", t("legendLabel"));
  const drawChart = () => {
    const layers = meta.categories.filter((c) => !hidden.has(c.id)).map((c) => ({
      label: name(c), color: getComputedStyle(document.documentElement).getPropertyValue(catColorVar(c)).trim(),
      hatch: catHatch(c), values: series.series[c.id]?.output || [],
    }));
    stackedChart(chartBox, { times: series.times, bucket: series.bucket, from: ctx.from, layers });
  };
  const drawLegend = () => {
    legend.replaceChildren(...[...meta.categories].reverse().map((c) => {
      const sw = el("i", { className: catHatch(c) ? "hatch" : "" });
      sw.style.backgroundColor = catColor(c);
      const b = el("button", { className: "chip", type: "button" }, [sw, document.createTextNode(name(c))]);
      b.setAttribute("aria-pressed", !hidden.has(c.id));
      b.onclick = () => {
        hidden.has(c.id) ? hidden.delete(c.id) : hidden.add(c.id);
        if (hidden.size === meta.categories.length) hidden.delete(c.id);   // 至少留一個
        drawLegend(); drawChart();
      };
      return b;
    }));
  };
  const bucketLabel = t(series.bucket === "10min" ? "bucket10" : series.bucket === "hour" ? "bucketHour" : "bucketDay");
  const chartCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [
      el("h2", {}, [document.createTextNode(t("chartTitle") + " "), el("span", { className: "sub", textContent: t("chartSub", bucketLabel) })]),
      legend]),
    chartBox]);

  // ---- 能源類型表 ----
  const shareTotal = Object.values(latest).reduce((s, c) => s + Math.max(0, c.now), 0);
  const rows = [...meta.categories].sort((a, b) => latest[b.id].now - latest[a.id].now).map((c) => {
    const s = series.series[c.id] || { output: [], cf: [] }, L = latest[c.id];
    const share = shareTotal ? Math.max(0, L.now) / shareTotal : 0;
    const energyMwh = s.output.reduce((sum, v) => sum + (v || 0), 0) * HOURS_PER_POINT[series.bucket];
    const sw = el("i", { className: "sw" + (catHatch(c) ? " hatch" : "") });
    sw.style.backgroundColor = catColor(c);
    const bar = el("i", { className: "bar" });
    bar.style.width = Math.max(2, share * 120) + "px";
    bar.style.background = catColor(c);
    const href = `#category-${c.code}`;
    const tr = el("tr", { tabIndex: 0 }, [
      el("td", {}, [sw, el("a", { href, textContent: name(c) })]),
      el("td", { textContent: fmt(L.now) }),
      el("td", { className: "c" }, [bar, document.createTextNode((share * 100).toFixed(1) + "%")]),
      el("td", { textContent: fmt(L.cap) }),
      el("td", { textContent: fmt(energyMwh / t("energyUnit")) }),
      el("td", { textContent: pct(mean(s.cf)) }),
      el("td", { textContent: L.units }),
    ]);
    tr.onclick = (e) => { if (e.target.tagName !== "A") location.hash = href; };
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.hash = href; } };
    return tr;
  });
  const catCard = el("section", { className: "card" }, [
    el("div", { className: "cardhead" }, [el("h2", { textContent: t("catTitle") }), el("span", { className: "sub", textContent: t("catHint") })]),
    table([t("colCategory"), t("colNow"), [t("colShare"), "c"], t("colCapacity"), t("colEnergy"), t("colCf"), t("colUnits")], rows),
    el("p", { className: "note", textContent: t("catNote") })]);

  root.replaceChildren(stats, chartCard, catCard);
  drawLegend();
  drawChart();
}

// ---- 這幾個小工具，類型頁和機組頁也會用到 ----

// 一排數字卡片：[[標題, 數字, 單位, 說明], ...]
export function statTiles(items) {
  return el("section", { className: "stats" }, items.map(([l, v, u, n]) => el("div", { className: "stat" }, [
    el("div", { className: "l", textContent: l }),
    el("div", { className: "v" }, [document.createTextNode(v), el("small", { textContent: u })]),
    el("div", { className: "n", textContent: n })])));
}

// 表格：headers 可以是文字，或 [文字, 欄位的 class]
export function table(headers, rows, { id } = {}) {
  const ths = headers.map((h) => (Array.isArray(h) ? el("th", { textContent: h[0], className: h[1] }) : el("th", { textContent: h })));
  const tbl = el("table", id ? { id } : {}, [el("thead", {}, [el("tr", {}, ths)]), el("tbody", {}, rows)]);
  return el("div", { className: "scroll" }, [tbl]);
}
