// 關於與計算方法（#about）
//
// 內容是 docs/methodology.md 的網站版（中英文）。
// 計算方法或假設有改時，要同時更新 docs/methodology.md 和這個檔案。
//
// 這裡的文字都是寫死在程式裡的固定內容（不是來自資料庫或使用者），所以直接用 innerHTML 排版。
// 從資料庫來的數字（資料起始日期、機組數）另外用 textContent 填進去。

import { getLang } from "../i18n.js";
import { el } from "../util.js";
import { crumbs } from "./category.js";

export async function load() {
  return {};
}

const REPO = "https://github.com/hsushengfan/taiwan-renewables";

const CONTENT = {
  zh: {
    crumb: "總覽",
    title: "關於與計算方法",
    html: `
<section class="card prose">
  <h3>關於這個網站</h3>
  <p>這個網站整理台灣電力公司公開的「各機組發電量即時資訊」，呈現台灣各能源與各發電機組的即時和歷史發電狀況，每 10 分鐘更新一次。</p>
  <p>這是個人專案，與台灣電力公司無關。數字僅供參考，請以台電公布的資料為準。</p>
</section>

<section class="card prose">
  <h3>資料來源</h3>
  <ul>
    <li>台灣電力公司「各機組發電量即時資訊」，經<a href="https://data.gov.tw/dataset/8931" target="_blank" rel="noopener">政府資料開放平臺</a>取得。</li>
    <li>台電約每 10 分鐘更新一次。本網站每 3 分鐘檢查一次，保存每一個時間點，目前共 <b data-fill="units"></b> 個機組。</li>
    <li>資料從 <b data-fill="since"></b>（台灣時間）開始。台電不提供這份資料的歷史紀錄，所以更早的資料無法補回。</li>
  </ul>
</section>

<section class="card prose">
  <h3>指標</h3>
  <div class="scroll"><table>
    <thead><tr><th>指標</th><th class="c">意思</th></tr></thead>
    <tbody>
      <tr><td>發電量（MW）</td><td class="c">台電公布的淨發電量，是那個時間點的瞬間值。抽蓄水力抽水、儲能充電時是負的。</td></tr>
      <tr><td>期間發電量（萬度）</td><td class="c">把每 10 分鐘的發電量乘上 1/6 小時，再加總。1 萬度 ＝ 10 MWh。</td></tr>
      <tr><td>裝置容量（MW）</td><td class="c">台電公布的裝置容量。部分機組台電沒有提供（顯示「—」），這些機組只顯示發電量。</td></tr>
      <tr><td>容量因數</td><td class="c">發電量 ÷ 裝置容量，限制在 0%～100%。整個類型的容量因數＝有裝置容量的機組發電量加總 ÷ 裝置容量加總，大機組的影響比較大。</td></tr>
      <tr><td>每日發電量</td><td class="c">當天平均發電量 × 24 小時。漏掉幾個時間點時，比直接加總更接近實際。</td></tr>
      <tr><td>資料完整度</td><td class="c">當天收到的時間點 ÷ 144（一天應有 144 個）。今天的完整度會隨時間增加。</td></tr>
    </tbody>
  </table></div>
  <p class="note">試運轉、通訊異常的時間點，以及沒有裝置容量或發電量數字的時間點，不列入容量因數的計算。</p>
</section>

<section class="card prose">
  <h3>為什麼沒有可用率（availability）</h3>
  <p>可用率的定義是「設備能發的電 ÷ 裝置容量」。台電只公布裝置容量和實際發電量，<b>沒有公布實際可用的容量</b>，所以真正的可用率算不出來。</p>
  <p>用備註去推估會有兩個問題：備註空白不代表設備完全可用（例如風場有幾支風機停機，台電通常不會標註）；有備註時也分不出發電量低是設備的問題，還是當時風小。這樣的推估容易被誤認為合約定義的可用率，所以本網站不提供，改為呈現容量因數和台電標註的機組狀態。</p>
</section>

<section class="card prose">
  <h3>機組狀態</h3>
  <p>狀態色帶顯示台電在每個時間點標註的備註。我們只把備註分類、決定顏色，沒有做任何推估；滑鼠移到色帶上會顯示備註原文。</p>
  <div class="scroll"><table>
    <thead><tr><th>狀態</th><th class="c">台電的備註</th></tr></thead>
    <tbody>
      <tr><td><i class="dot" style="background:var(--st-good)"></i>正常</td><td class="c">（空白）</td></tr>
      <tr><td><i class="dot" style="background:var(--st-vol)"></i>主動少發</td><td class="c">配合綠電先行、友善降載減排</td></tr>
      <tr><td><i class="dot" style="background:var(--st-warn)"></i>部分停機</td><td class="c">部分檢修、部分歲修、部分故障、運轉限制、環保限制</td></tr>
      <tr><td><i class="dot" style="background:var(--st-crit)"></i>停機</td><td class="c">檢修、歲修、故障</td></tr>
      <tr><td><i class="dot" style="background:var(--st-none)"></i>試運轉</td><td class="c">新機組試俥、新增設備測試運轉、測試運轉</td></tr>
      <tr><td><i class="dot" style="background:var(--st-none)"></i>狀態不明</td><td class="c">通訊異常</td></tr>
      <tr><td><i class="dot" style="background:var(--st-serious)"></i>其他備註</td><td class="c">合約限制、計劃停機、環保檢測，以及其他尚未歸類的備註</td></tr>
    </tbody>
  </table></div>
</section>

<section class="card prose">
  <h3>能源分類</h3>
  <p>網站把台電的機組類型整理成 11 類：燃煤、民營燃煤、燃氣、民營燃氣、其它火力（燃料油、汽電共生）、儲能、水力、其它再生能源、太陽能、陸域風電、離岸風電。</p>
  <p>台電的資料只有「風力」一類，<b>陸域風電和離岸風電是本網站自行分類的</b>。</p>
</section>

<section class="card prose">
  <h3>已知限制</h3>
  <ol>
    <li><b>狀態完全依賴台電的標註。</b>台電沒有標註的停機或限制，我們無法得知。</li>
    <li><b>容量因數低不代表設備有問題。</b>太陽能晚上是 0%、風場在無風時很低，都是正常的。要判斷設備狀況，請搭配狀態色帶一起看。</li>
    <li><b>部分資料列是多個機組的合計</b>，例如「其它購電太陽能」、「北部小水力」，只能當作一個整體。依台電的註解，太陽能只有裝置容量高於 20 MW、且併接電壓等級 69 仟伏以上的案場會單獨列出，其餘合併在「其它購電太陽能」，約占太陽能總裝置容量的 98%。</li>
    <li><b>發電量偶爾會超過裝置容量</b>（例如 104%），可能是裝置容量資料還沒更新。容量因數最多算 100%。</li>
  </ol>
</section>

<section class="card prose">
  <h3>隱私</h3>
  <p>本網站用 <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a> 統計瀏覽次數。它不使用 cookie，也不記錄可以辨識個人的資訊。網站沒有登入功能，不收集任何個人資料。</p>
</section>

<section class="card prose">
  <h3>原始碼與完整說明</h3>
  <p>網站和資料收集的程式碼公開在 <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>，完整的計算說明見 <a href="${REPO}/blob/main/docs/methodology.md" target="_blank" rel="noopener">methodology.md</a>。</p>
</section>`,
  },
  en: {
    crumb: "Overview",
    title: "About & methodology",
    html: `
<section class="card prose">
  <h3>About this site</h3>
  <p>This site presents Taiwan Power Company's open data on real-time generation by unit. It shows current and historical output for every source and generating unit in Taiwan, updated every 10 minutes.</p>
  <p>It is an independent personal project, not affiliated with Taiwan Power Company. Figures are for reference only; Taipower's published data is authoritative.</p>
</section>

<section class="card prose">
  <h3>Data source</h3>
  <ul>
    <li>Taiwan Power Company, real-time generation by unit, via the <a href="https://data.gov.tw/dataset/8931" target="_blank" rel="noopener">Government Open Data Platform</a>.</li>
    <li>Taipower updates the data about every 10 minutes. This site checks every 3 minutes and keeps every snapshot. It currently tracks <b data-fill="units"></b> units.</li>
    <li>Data starts on <b data-fill="since"></b> (Taiwan time). Taipower does not publish a history of this dataset, so earlier data cannot be recovered.</li>
  </ul>
</section>

<section class="card prose">
  <h3>Measures</h3>
  <div class="scroll"><table>
    <thead><tr><th>Measure</th><th class="c">Meaning</th></tr></thead>
    <tbody>
      <tr><td>Output (MW)</td><td class="c">Net output as published by Taipower, an instantaneous value at each point in time. Negative for pumped hydro while pumping and for storage while charging.</td></tr>
      <tr><td>Energy in period (MWh)</td><td class="c">Each 10-minute output value × 1/6 hour, summed over the period.</td></tr>
      <tr><td>Installed capacity (MW)</td><td class="c">Capacity as published by Taipower. Some units have no published capacity (shown as "—"); for those only output is shown.</td></tr>
      <tr><td>Capacity factor</td><td class="c">Output ÷ installed capacity, limited to 0–100%. For a whole source: total output of units with a published capacity ÷ their total capacity, so larger units weigh more.</td></tr>
      <tr><td>Daily energy</td><td class="c">Average output that day × 24 hours. Closer to the true figure than a plain sum when a few points are missing.</td></tr>
      <tr><td>Data completeness</td><td class="c">10-minute points received that day ÷ 144. Today's completeness grows through the day.</td></tr>
    </tbody>
  </table></div>
  <p class="note">Points marked as commissioning or communication error, and points without a capacity or output value, are left out of the capacity factor.</p>
</section>

<section class="card prose">
  <h3>Why there is no availability figure</h3>
  <p>Availability is the energy a unit could have produced ÷ its capacity. Taipower publishes capacity and actual output, but <b>not the capacity that was actually available</b>, so true availability cannot be calculated.</p>
  <p>Estimating it from the remarks has two problems: a blank remark does not mean the unit was fully available (Taipower usually does not flag a few turbines being down), and when there is a remark, low output cannot be separated into equipment limits versus low wind. Such an estimate is easily mistaken for contractual availability, so this site shows capacity factor and Taipower's status remarks instead.</p>
</section>

<section class="card prose">
  <h3>Unit status</h3>
  <p>The status strip shows the remark Taipower attached at each point in time. We only group the remarks and pick colours; nothing is estimated. Hover over the strip to see the original remark.</p>
  <div class="scroll"><table>
    <thead><tr><th>Status</th><th class="c">Taipower remarks</th></tr></thead>
    <tbody>
      <tr><td><i class="dot" style="background:var(--st-good)"></i>Normal</td><td class="c">(blank)</td></tr>
      <tr><td><i class="dot" style="background:var(--st-vol)"></i>Voluntary curtailment</td><td class="c">Green power priority, derated to reduce emissions</td></tr>
      <tr><td><i class="dot" style="background:var(--st-warn)"></i>Partial outage</td><td class="c">Partial maintenance, partial annual overhaul, partial fault, operating limit, environmental limit</td></tr>
      <tr><td><i class="dot" style="background:var(--st-crit)"></i>Outage</td><td class="c">Maintenance, annual overhaul, fault</td></tr>
      <tr><td><i class="dot" style="background:var(--st-none)"></i>Commissioning</td><td class="c">New unit trial run, new equipment test run, test run</td></tr>
      <tr><td><i class="dot" style="background:var(--st-none)"></i>Unknown</td><td class="c">Communication error</td></tr>
      <tr><td><i class="dot" style="background:var(--st-serious)"></i>Other remark</td><td class="c">Contract limit, planned outage, environmental testing, and any remark not yet grouped</td></tr>
    </tbody>
  </table></div>
</section>

<section class="card prose">
  <h3>Source categories</h3>
  <p>Taipower's unit types are grouped into 11 sources: coal, IPP coal, gas, IPP gas, other thermal (fuel oil and cogeneration), storage, hydro, other renewables, solar, onshore wind and offshore wind.</p>
  <p>Taipower publishes a single "wind" type. <b>The split into onshore and offshore wind is made by this site.</b></p>
</section>

<section class="card prose">
  <h3>Known limitations</h3>
  <ol>
    <li><b>Status relies entirely on Taipower's remarks.</b> Outages or limits that Taipower does not flag cannot be seen.</li>
    <li><b>A low capacity factor does not mean a problem.</b> Solar is 0% at night and wind farms run low in calm weather. Read it together with the status strip.</li>
    <li><b>Some rows combine several units</b>, such as "Other Purchased Solar" and "Northern Small Hydro", and can only be treated as a whole. According to Taipower's notes, only solar plants above 20 MW connected at 69 kV or higher are listed individually; the rest are combined into "Other Purchased Solar", about 98% of total solar capacity.</li>
    <li><b>Output occasionally exceeds installed capacity</b> (for example 104%), possibly because the capacity figure has not been updated. Capacity factor is capped at 100%.</li>
  </ol>
</section>

<section class="card prose">
  <h3>Privacy</h3>
  <p>This site counts page views with <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, which uses no cookies and records no information that identifies individuals. The site has no sign-in and collects no personal data.</p>
</section>

<section class="card prose">
  <h3>Source code and full methodology</h3>
  <p>The code for the site and data collection is public on <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>. The full methodology (in Chinese) is in <a href="${REPO}/blob/main/docs/methodology.md" target="_blank" rel="noopener">methodology.md</a>.</p>
</section>`,
  },
};

export function render(root, ctx) {
  const c = CONTENT[getLang()];
  const body = el("div", { className: "about" });
  body.innerHTML = c.html;
  body.querySelectorAll('[data-fill="units"]').forEach((e) => { e.textContent = String(ctx.meta.units.length); });
  body.querySelectorAll('[data-fill="since"]').forEach((e) => { e.textContent = `${ctx.meta.earliest.slice(0, 10)} ${ctx.meta.earliest.slice(11, 16)}`; });
  root.replaceChildren(
    el("div", { className: "pagehead" }, [crumbs([[c.crumb, "#"], [c.title]]), el("h2", { className: "pagetitle", textContent: c.title })]),
    ...body.children,
  );
}
