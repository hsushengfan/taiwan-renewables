// 各頁面共用的圖表
//
//   stackedChart()  總覽頁：各能源堆疊面積圖
//   areaChart()     能源類型頁、機組頁：單一條發電量曲線，加上「裝置容量」參考線，
//                   機組頁另外在圖的下方畫一條和時間軸對齊的狀態色帶
//   sparkline()     表格裡的小趨勢線
//   statusStrip()   表格裡的小狀態色帶
//
// 橫軸都照「真實時間」排列：沒有資料的時段留白，不會把前後的資料接在一起。

import { el, svgEl, cssVar, fmt, hhmm, mmdd, taipeiIso } from "./util.js";
import { t } from "./i18n.js";

const BUCKET_MS = { "10min": 600e3, hour: 3600e3, day: 86400e3 };
const H = 340;                                   // 圖的高度
const M = { l: 48, r: 12, t: 10, b: 26 };        // 四邊留白

// 狀態的顏色（對應 statuses.id；0 是那個時間點沒有資料）
export const STATUS_COLOR = {
  0: "--st-none", 1: "--st-good", 2: "--st-vol", 3: "--st-warn",
  4: "--st-crit", 5: "--st-none", 6: "--st-none", 7: "--st-serious",
};

// ---------------------------------------------------------------------
// 共用：建立圖的外框（svg + 提示框），並算好時間軸
// ---------------------------------------------------------------------
function setup(container, { times, from, extraBottom = 0 }) {
  container.classList.add("chart");
  const svg = svgEl("svg", { role: "img" });
  const tip = el("div", { className: "tip", hidden: true });
  container.replaceChildren(svg, tip);
  const W = container.clientWidth || 800, height = H + extraBottom;
  svg.setAttribute("viewBox", `0 0 ${W} ${height}`);
  svg.style.height = height + "px";

  const ms = times.map((iso) => new Date(iso).getTime());
  const t0 = from, t1 = Math.max(ms[ms.length - 1] || from + 1, from + 1);
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const xt = (time) => M.l + ((time - t0) / (t1 - t0)) * iw;
  return { svg, tip, W, iw, ih, ms, t0, t1, xt, x: (i) => xt(ms[i]) };
}

// 縱軸：算出好讀的刻度（0、5,000、10,000…），畫橫向格線
function yAxis(g, min, max) {
  const span = Math.max(max - min, 1);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((s) => span / s <= 6) || 10000;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step || step;
  const y = (v) => M.t + g.ih - ((v - lo) / (hi - lo)) * g.ih;
  for (let v = lo; v <= hi + step / 2; v += step) {
    g.svg.append(svgEl("line", { x1: M.l, x2: g.W - M.r, y1: y(v), y2: y(v), stroke: cssVar(v === 0 ? "--axis" : "--grid"), "stroke-width": 1 }));
    const label = svgEl("text", { x: M.l - 8, y: y(v) + 4, "text-anchor": "end" });
    label.textContent = Math.abs(hi) >= 10000 ? v / 1000 + "K" : v.toLocaleString();
    g.svg.append(label);
  }
  return y;
}

// 橫軸：36 小時以內每 3 小時標「時:分」，更長的範圍在每天 00:00 標「月-日」
function xAxis(g, labelY) {
  const longRange = g.t1 - g.t0 > 36 * 3600e3;
  let lastX = -Infinity;
  for (let time = Math.ceil(g.t0 / 3600e3) * 3600e3; time <= g.t1; time += 3600e3) {
    const iso = taipeiIso(time), hour = Number(iso.slice(11, 13));
    if (longRange ? hour !== 0 : hour % 3 !== 0) continue;
    const px = g.xt(time);
    if (px - lastX < 56 || px > g.W - M.r - 16 || px < M.l + 4) continue;
    const label = svgEl("text", { x: px, y: labelY, "text-anchor": "middle" });
    label.textContent = longRange ? mmdd(iso) : hhmm(iso);
    g.svg.append(label);
    lastX = px;
  }
  return longRange;
}

// 把資料切成「連續的區段」：兩筆之間隔超過 1.5 個間隔就斷開
function segments(ms, bucket) {
  const gap = BUCKET_MS[bucket] * 1.5, out = [];
  for (let i = 0, start = 0; i <= ms.length; i++) {
    if (i === ms.length || (i > 0 && ms[i] - ms[i - 1] > gap)) { out.push([start, i - 1]); start = i; }
  }
  return out;
}

// 一塊面積：上緣是 upper、下緣是 lower，每個連續區段畫一塊
function areaPath(g, y, upper, lower, segs) {
  const pt = (arr, i) => `${g.x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`;
  return segs.filter(([a, b]) => b > a).map(([a, b]) => {
    const up = [], down = [];
    for (let i = a; i <= b; i++) { up.push(pt(upper, i)); down.unshift(pt(lower, i)); }
    return "M" + up.join("L") + "L" + down.join("L") + "Z";
  }).join("");
}

// 斜線紋路（民營電廠、陸域風電用）
function hatchPattern(g, id, color) {
  let defs = g.svg.querySelector("defs");
  if (!defs) { defs = svgEl("defs"); g.svg.prepend(defs); }
  const p = svgEl("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  p.append(svgEl("rect", { width: 6, height: 6, fill: color }), svgEl("rect", { width: 2, height: 6, fill: cssVar("--surface") }));
  defs.append(p);
  return `url(#${id})`;
}

// 滑鼠移動時：找最近的時間點，畫一條直線，顯示提示框
function crosshair(g, times, rowsAt) {
  const cross = svgEl("line", { y1: M.t, y2: M.t + g.ih, stroke: cssVar("--ink2"), "stroke-width": 1, visibility: "hidden" });
  g.svg.append(cross);
  const show = (clientX) => {
    const rect = g.svg.getBoundingClientRect();
    const time = g.t0 + ((clientX - rect.left - M.l) / g.iw) * (g.t1 - g.t0);
    let i = 0;
    for (let k = 1; k < g.ms.length; k++) if (Math.abs(g.ms[k] - time) < Math.abs(g.ms[i] - time)) i = k;
    cross.setAttribute("x1", g.x(i)); cross.setAttribute("x2", g.x(i)); cross.setAttribute("visibility", "visible");
    g.tip.replaceChildren(el("div", { className: "t", textContent: `${times[i].slice(0, 10)} ${hhmm(times[i])}` }));
    rowsAt(i).forEach(([label, value, color, isTotal]) => {
      const left = el("span");
      if (color) { const k = el("i", { className: "k" }); k.style.background = color; left.append(k); }
      left.append(document.createTextNode(label));
      g.tip.append(el("div", { className: "r" + (isTotal ? " tot" : "") }, [left, el("b", { textContent: value })]));
    });
    g.tip.hidden = false;
    const w = g.tip.offsetWidth, left = g.x(i) + 12 + w > g.W ? g.x(i) - 12 - w : g.x(i) + 12;
    g.tip.style.left = Math.max(0, left) + "px";
  };
  const hide = () => { g.tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  g.svg.addEventListener("pointermove", (e) => show(e.clientX));
  g.svg.addEventListener("pointerdown", (e) => show(e.clientX));
  g.svg.addEventListener("pointerleave", hide);
}

// ---------------------------------------------------------------------
// 堆疊面積圖（總覽頁）
//   layers：由下往上的每一層 { label, color, hatch, values }
// ---------------------------------------------------------------------
export function stackedChart(container, { times, bucket, from, layers }) {
  const g = setup(container, { times, from });
  g.svg.setAttribute("aria-label", t("chartTitle"));
  if (!times.length) return;
  const val = (layer, i) => Math.max(0, layer.values[i] || 0);
  const totals = times.map((_, i) => layers.reduce((s, l) => s + val(l, i), 0));
  const y = yAxis(g, 0, Math.max(...totals, 1));
  const longRange = xAxis(g, H - 8);
  const segs = segments(g.ms, bucket);

  const base = new Array(times.length).fill(0);
  layers.forEach((layer, n) => {
    const lower = base.slice();
    times.forEach((_, i) => { base[i] += val(layer, i); });
    const d = areaPath(g, y, base, lower, segs);
    if (!d) return;
    g.svg.append(svgEl("path", {
      d, fill: layer.hatch ? hatchPattern(g, "h" + n, layer.color) : layer.color,
      stroke: cssVar("--surface"), "stroke-width": longRange ? 0.75 : 1.5, "stroke-linejoin": "round",
    }));
  });

  crosshair(g, times, (i) => [
    ...[...layers].reverse().map((l) => [l.label, fmt(val(l, i)), l.color]),
    [t("total"), fmt(totals[i]) + " MW", null, true],
  ]);
}

// ---------------------------------------------------------------------
// 單一條發電量曲線（能源類型頁、機組頁）
//   capacity：裝置容量，畫成一條水平參考線（沒有就不畫）
//   tipRows(i)：提示框裡除了發電量之外，還要顯示的列
//   band：機組頁的狀態色帶 { statuses, labels }，畫在圖的下方、和時間軸對齊
// ---------------------------------------------------------------------
export function areaChart(container, { times, bucket, from, values, color, hatch, label, capacity, tipRows, band }) {
  const BAND = band ? 34 : 0;
  const g = setup(container, { times, from, extraBottom: BAND });
  g.svg.setAttribute("aria-label", label);
  if (!times.length) return;
  const vals = values.map((v) => (v == null ? null : v));
  const nums = vals.filter((v) => v != null);
  const y = yAxis(g, Math.min(0, ...nums), Math.max(capacity || 0, ...nums, 1));
  xAxis(g, H - 8);
  const segs = segments(g.ms, bucket);

  // 面積：從 0 到發電量
  const zero = vals.map(() => 0), filled = vals.map((v) => v || 0);
  const d = areaPath(g, y, filled, zero, segs);
  if (d) g.svg.append(svgEl("path", { d, fill: hatch ? hatchPattern(g, "ha", color) : color, "fill-opacity": hatch ? 0.35 : 0.18 }));
  // 線：發電量
  segs.filter(([a, b]) => b > a).forEach(([a, b]) => {
    const pts = [];
    for (let i = a; i <= b; i++) pts.push(`${g.x(i).toFixed(1)},${y(filled[i]).toFixed(1)}`);
    g.svg.append(svgEl("polyline", { points: pts.join(" "), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
  });

  // 裝置容量的參考線
  if (capacity) {
    g.svg.append(svgEl("line", { x1: M.l, x2: g.W - M.r, y1: y(capacity), y2: y(capacity), stroke: cssVar("--ink2"), "stroke-width": 1, "stroke-dasharray": "4 3" }));
    const lab = svgEl("text", { x: g.W - M.r, y: y(capacity) - 5, "text-anchor": "end", class: "ref" });
    lab.textContent = `${t("capacityLine")} ${fmt(capacity, 1)} MW`;
    g.svg.append(lab);
  }

  // 狀態色帶：每個資料點畫成一小段，寬度是一個間隔
  if (band) {
    const top = H + 4, w = (g.iw * BUCKET_MS[bucket]) / (g.t1 - g.t0);
    const caption = svgEl("text", { x: M.l - 8, y: top + 14, "text-anchor": "end" });
    caption.textContent = t("colStatus");
    g.svg.append(caption);
    for (let i = 0; i < times.length;) {
      let j = i;
      while (j < times.length && band.statuses[j] === band.statuses[i] && band.labels[j] === band.labels[i] && (j === i || g.ms[j] - g.ms[j - 1] <= BUCKET_MS[bucket] * 1.5)) j++;
      const x0 = g.x(i), x1 = Math.min(g.x(j - 1) + w, g.W - M.r);
      const rect = svgEl("rect", { x: x0, y: top, width: Math.max(x1 - x0, 1), height: 20, fill: cssVar(STATUS_COLOR[band.statuses[i]] || "--st-none") });
      const title = svgEl("title");
      title.textContent = `${mmdd(times[i])} ${hhmm(times[i])} – ${mmdd(times[j - 1])} ${hhmm(times[j - 1])}　${band.labels[i]}`;
      rect.append(title);
      g.svg.append(rect);
      i = j;
    }
  }

  crosshair(g, times, (i) => [[label, vals[i] == null ? "—" : fmt(vals[i], 1) + " MW", color], ...(tipRows ? tipRows(i) : [])]);
}

// ---------------------------------------------------------------------
// 表格用的小圖
// ---------------------------------------------------------------------

// 小趨勢線：高度的上限是裝置容量（沒有容量就用期間最大值）
export function sparkline(values, cap) {
  const svg = svgEl("svg", { class: "spark", viewBox: "0 0 96 22", "aria-hidden": "true" });
  const n = values.length;
  if (n < 2) return svg;
  const vals = values.map((v) => Math.max(0, v || 0)), max = Math.max(cap || 0, ...vals, 0.001);
  svg.append(svgEl("polyline", {
    points: vals.map((v, i) => `${((i / (n - 1)) * 94 + 1).toFixed(1)},${(20 - (v / max) * 18).toFixed(1)}`).join(" "),
    fill: "none", stroke: cssVar("--ink2"), "stroke-width": 1.5, "stroke-linejoin": "round",
  }));
  return svg;
}

// 小狀態色帶：連續相同的狀態（而且說明相同）畫成一段
//   labels[i]：第 i 個時間點的說明文字（有備註就是備註原文，沒有就是狀態名稱）
export function statusStrip(statuses, labels, times) {
  const n = statuses.length;
  const svg = svgEl("svg", { class: "strip", viewBox: `0 0 ${Math.max(n, 1)} 1`, preserveAspectRatio: "none", role: "img" });
  const counts = {};
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && statuses[j] === statuses[i] && labels[j] === labels[i]) j++;
    const rect = svgEl("rect", { x: i, y: 0, width: j - i, height: 1, fill: cssVar(STATUS_COLOR[statuses[i]] || "--st-none") });
    const title = svgEl("title");
    title.textContent = `${mmdd(times[i])} ${hhmm(times[i])} – ${mmdd(times[j - 1])} ${hhmm(times[j - 1])}　${labels[i]}`;
    rect.append(title);
    svg.append(rect);
    counts[labels[i]] = (counts[labels[i]] || 0) + (j - i);
    i = j;
  }
  svg.setAttribute("aria-label", Object.entries(counts).map(([l, c]) => `${l} ${Math.round((c / n) * 100)}%`).join(", "));
  return svg;
}
