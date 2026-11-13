// 介面文字的中英文對照。資料裡的名稱（機組、分類、狀態、備註）由資料庫提供，不在這裡。
const TEXT = {
  zh: {
    title: "台灣電力概況",
    asof: (t) => `資料時間 ${t}（台灣時間，台電每 10 分鐘更新）`,
    loading: "讀取資料中…",
    error: "讀取資料失敗",
    retry: "重試",
    range24h: "24 小時", range7d: "7 天", range30d: "30 天", range1y: "1 年",
    rangeSoon: "資料累積中，之後開放",
    statTotal: "目前總發電量", statTotalNote: (n) => `全部 ${n} 個機組合計`,
    statRenewable: "再生能源佔比", statRenewableNote: (mw) => `${mw} MW（水力、風力、太陽能、其它）`,
    statWind: "風力", statWindNote: (off, on) => `離岸 ${off}、陸域 ${on} MW`,
    statSolar: "太陽能", statSolarNight: "目前沒有發電", statSolarPeak: (mw) => `期間最高 ${mw} MW`,
    chartTitle: "各能源發電量", chartSub: (b) => `MW，${b}`,
    bucket10: "每 10 分鐘", bucketHour: "每小時平均", bucketDay: "每日平均",
    legendLabel: "顯示或隱藏能源類型",
    total: "合計",
    catTitle: "能源類型", catHint: "點一列看該類型的機組",
    colCategory: "類型", colNow: "目前發電量 (MW)", colShare: "佔比", colCapacity: "裝置容量 (MW)",
    colEnergy: "期間發電量 (萬度)", colCf: "期間容量因數", colUnits: "機組數",
    catNote: "裝置容量只加總台電有提供容量的機組。期間發電量由每 10 分鐘的發電量累計而來。1 萬度 ＝ 10 MWh。",
    unitTitle: (c) => `${c} 機組`,
    colUnit: "機組", colUnitCf: "期間容量因數", colTrend: "出力", colStatus: "狀態", colRemark: "目前備註",
    unitNote: "容量因數＝發電量 ÷ 裝置容量。沒有裝置容量的機組只顯示發電量。狀態色帶是台電在每個時間點標註的備註，由左到右是時間先後。",
    noData: "無資料",
    footSource: "資料來源：台灣電力公司「各機組發電量即時資訊」",
    footMethod: "計算方法與假設",
    footNote: "本網站為個人專案，與台灣電力公司無關。數字僅供參考。",
    energyUnit: 1e4 / 1e3,   // 顯示單位是萬度：MWh ÷ 10
  },
  en: {
    title: "Taiwan Power Overview",
    asof: (t) => `Data as of ${t} (Taiwan time; Taipower updates every 10 minutes)`,
    loading: "Loading…",
    error: "Could not load data",
    retry: "Retry",
    range24h: "24 hours", range7d: "7 days", range30d: "30 days", range1y: "1 year",
    rangeSoon: "Available once enough data has been collected",
    statTotal: "Total generation now", statTotalNote: (n) => `Sum of all ${n} units`,
    statRenewable: "Renewable share", statRenewableNote: (mw) => `${mw} MW (hydro, wind, solar, other)`,
    statWind: "Wind", statWindNote: (off, on) => `Offshore ${off}, onshore ${on} MW`,
    statSolar: "Solar", statSolarNight: "Not generating now", statSolarPeak: (mw) => `Period peak ${mw} MW`,
    chartTitle: "Generation by source", chartSub: (b) => `MW, ${b}`,
    bucket10: "10-minute data", bucketHour: "hourly average", bucketDay: "daily average",
    legendLabel: "Show or hide sources",
    total: "Total",
    catTitle: "Sources", catHint: "Select a row to see its units",
    colCategory: "Source", colNow: "Output now (MW)", colShare: "Share", colCapacity: "Capacity (MW)",
    colEnergy: "Energy in period (MWh)", colCf: "Capacity factor", colUnits: "Units",
    catNote: "Capacity sums only the units for which Taipower publishes a capacity. Energy is accumulated from the 10-minute output values.",
    unitTitle: (c) => `${c} units`,
    colUnit: "Unit", colUnitCf: "Capacity factor", colTrend: "Output", colStatus: "Status", colRemark: "Current remark",
    unitNote: "Capacity factor = output ÷ installed capacity. Units without a published capacity show output only. The status strip shows the remark Taipower attached at each point in time, oldest on the left.",
    noData: "No data",
    footSource: "Source: Taiwan Power Company, real-time generation by unit",
    footMethod: "Methodology and assumptions",
    footNote: "An independent personal project, not affiliated with Taiwan Power Company. Figures are for reference only.",
    energyUnit: 1,           // 顯示單位是 MWh
  },
};

let lang = "zh";
try {
  const saved = localStorage.getItem("lang");
  if (saved === "zh" || saved === "en") lang = saved;
  else if (!navigator.language.toLowerCase().startsWith("zh")) lang = "en";
} catch { /* 讀不到就用預設的中文 */ }

export const getLang = () => lang;
export function setLang(next) {
  lang = next;
  try { localStorage.setItem("lang", next); } catch { /* 存不了也沒關係 */ }
}
export const t = (key, ...args) => {
  const v = TEXT[lang][key];
  return typeof v === "function" ? v(...args) : v;
};
// 資料庫給的名稱：依語言挑 name_zh 或 name_en，英文沒有時退回中文
export const name = (obj) => (lang === "en" && obj.name_en) || obj.name_zh;
export const locale = () => (lang === "en" ? "en-US" : "zh-TW");
