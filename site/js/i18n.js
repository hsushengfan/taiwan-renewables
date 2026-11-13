// 介面文字的中英文對照。資料裡的名稱（機組、分類、狀態、備註）由資料庫提供，不在這裡。
const TEXT = {
  zh: {
    title: "台灣電力概況",
    navOverview: "總覽",
    navAbout: "關於與計算方法",
    notFound: "找不到這個頁面，已回到總覽。",
    capacityLine: "裝置容量",
    output: "發電量",
    cf: "容量因數",
    statNow: "目前發電量",
    statCapacity: "裝置容量",
    statCapacityNote: (n, m) => `${m} 個機組中，${n} 個有提供容量`,
    statCf: "期間容量因數",
    statCfNote: "期間每 10 分鐘的平均",
    statEnergy: "期間發電量",
    energyLabel: "萬度",
    statEnergyNote: (from, to) => `${from} ～ ${to}`,
    statStatus: "目前狀態",
    statStatusNote: (s) => `狀態：${s}`,
    noCapacity: "台電沒有提供裝置容量",
    catChartTitle: (c) => `${c} 發電量`,
    catNote2: "虛線是這一類有提供容量的機組，裝置容量的合計。容量因數＝發電量 ÷ 裝置容量，只計入有裝置容量的機組。",
    unitChartTitle: "發電量與狀態",
    unitMeta: (cat, type) => `${cat}・台電分類：${type}`,
    dailyTitle: "每日紀錄",
    colDay: "日期", colDayEnergy: "發電量 (萬度)", colCompleteness: "資料完整度", colFlags: "停機類備註",
    times: (n) => `${n} 次`,
    dailyNote: "今天的數字只包含到目前為止的資料。發電量＝當天平均出力 × 24 小時。資料完整度＝當天收到的時間點 ÷ 144。停機類備註是當天出現的部分停機、停機、其他備註，以及出現的次數（每次代表 10 分鐘）。",
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
    catTitle: "能源類型", catHint: "點一列看該類型的機組和詳細曲線",
    colCategory: "類型", colNow: "目前發電量 (MW)", colShare: "佔比", colCapacity: "裝置容量 (MW)",
    colEnergy: "期間發電量 (萬度)", colCf: "期間容量因數", colUnits: "機組數",
    catNote: "裝置容量只加總台電有提供容量的機組。期間發電量由每 10 分鐘的發電量累計而來。1 萬度 ＝ 10 MWh。",
    unitTitle: "機組", unitHint: "點機組名稱看詳細的發電曲線和每日紀錄",
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
    navOverview: "Overview",
    navAbout: "About & methodology",
    notFound: "That page doesn't exist. Showing the overview instead.",
    capacityLine: "Capacity",
    output: "Output",
    cf: "Capacity factor",
    statNow: "Output now",
    statCapacity: "Installed capacity",
    statCapacityNote: (n, m) => `${n} of ${m} units publish a capacity`,
    statCf: "Capacity factor in period",
    statCfNote: "Average of the 10-minute values",
    statEnergy: "Energy in period",
    energyLabel: "MWh",
    statEnergyNote: (from, to) => `${from} – ${to}`,
    statStatus: "Current status",
    statStatusNote: (s) => `Status: ${s}`,
    noCapacity: "No capacity published by Taipower",
    catChartTitle: (c) => `${c} output`,
    catNote2: "The dashed line is the total capacity of the units in this source that publish a capacity. Capacity factor = output ÷ capacity, counting only units with a published capacity.",
    unitChartTitle: "Output and status",
    unitMeta: (cat, type) => `${cat} · Taipower type: ${type}`,
    dailyTitle: "Daily record",
    colDay: "Date", colDayEnergy: "Energy (MWh)", colCompleteness: "Data completeness", colFlags: "Outage-type remarks",
    times: (n) => `×${n}`,
    dailyNote: "Today's row only includes data so far. Energy = average output that day × 24 hours. Data completeness = 10-minute points received ÷ 144. Outage-type remarks lists partial outages, outages and other remarks seen that day, with how many 10-minute points each covered.",
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
    catTitle: "Sources", catHint: "Select a row to see its units and chart",
    colCategory: "Source", colNow: "Output now (MW)", colShare: "Share", colCapacity: "Capacity (MW)",
    colEnergy: "Energy in period (MWh)", colCf: "Capacity factor", colUnits: "Units",
    catNote: "Capacity sums only the units for which Taipower publishes a capacity. Energy is accumulated from the 10-minute output values.",
    unitTitle: "Units", unitHint: "Select a unit to see its chart and daily record",
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

// 台電原本的機組類型（units.type）的英文
const TAIPOWER_TYPE_EN = {
  "燃煤": "Coal", "民營電廠-燃煤": "IPP coal", "燃氣": "Gas", "民營電廠-燃氣": "IPP gas",
  "燃料油": "Fuel oil", "汽電共生": "Cogeneration", "儲能": "Storage", "水力": "Hydro",
  "其它再生能源": "Other renewables", "太陽能": "Solar", "風力": "Wind",
};
export const taipowerType = (type) => (lang === "en" && TAIPOWER_TYPE_EN[type]) || type;
