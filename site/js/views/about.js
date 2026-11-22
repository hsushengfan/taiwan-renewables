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
  <h3>電價與轉供費率資料</h3>
  <ul>
    <li>「<a href="#price">電價</a>」和「<a href="#wheeling">轉供費率</a>」兩頁的數字是人工整理的，來自台電與經濟部能源署的公開資料，不是自動收集的。</li>
    <li><b>平均單價</b>＝電費收入 ÷ 售電度數，是實績，不是電價表上的牌價。來源：台電「歷年平均單價」。</li>
    <li><b>每度售電成本</b>由三個官方來源拼接（立法院預算中心、監察院報告、台電「電價及單位成本結構比較」），各年來源不同；2023 年只有 2 位小數，照原精度顯示。</li>
    <li><b>轉供費率</b>從 2019 年起記錄，以台電每年公告的「輸配電業各項費率方案」為準（每一年的原始 PDF 都可以在轉供費率頁點開）。公告上的費率含 5% 營業稅，本站存未稅值：每一年都是公告值 ÷ 1.05（四捨五入到小數第 4 位），合計是四項公告值加總 ÷ 1.05。</li>
    <li><b>應有單價</b>是台電依電價公式估算的電價水準（提報審議會的估計值，不是實際電價），從能源署電價費率審議會各場的台電簡報逐場整理，2015 年起共 23 場。112～113 年的 4 場，台電簡報沒有寫應有單價，只列出成本合計和售電量，改用「合計成本 ÷ 售電量」推算。2017 年沒有提報；2015–2016 年用的是舊的電價公式。</li>
    <li><b>含稅或未稅：</b>資料一律存未稅值，含稅＝未稅 × 1.05。台電沒有明文寫平均單價是否含稅，本站依三項證據判斷為未稅：(1) 和決算表的「每度平均電價」幾乎相同，而決算的營業收入不含營業稅；(2) 審議會公布的平均電價和電價表的含稅價差約 5%；(3) 輸配電費率公式明文寫「計算結果不含營業稅，公告時自行計入」。每度售電成本沒有含稅的概念，不隨切換改變。</li>
    <li><b>更新頻率：</b>平均單價每年、售電成本每月、轉供費率每年 12 月、電價調整每年 3 月與 9 月審議後。</li>
  </ul>
</section>

<section class="card prose">
  <h3>業者排名</h3>
  <ul>
    <li>「<a href="#companies">業者</a>」頁依 T-REC（國家再生能源憑證中心）公開的<b>直轉供憑證成交紀錄</b>，依<b>出售單位</b>加總 2020 年至今的移轉量，排出售電業和發電業各前 20 名（排除台電）。不用憑證持有人排名，因為持有人和出售單位不一定是同一家。</li>
    <li>售電業或發電業以能源署公布的名單為準。大彰化西北離岸風力發電還沒列入發電廠名單，本站依實際營運列為發電業並加註。</li>
    <li>能源別、賣出過的案場數、裝置容量，都用這家公司賣出過的案場計算；裝置容量用案場編號對到已發放憑證。</li>
    <li>每月 15 日自動更新，今年和去年都重抓。每次都驗算筆數、T-REC 公布的總量，以及「已發放＝直轉供＋自用發電設備＋尚未移轉」，不相符就不更新。</li>
    <li><b>限制：</b>憑證交給售電業代管的發電業看不到；大型離岸風場大多躉售給台電、沒有憑證；累計量對越早開始的業者越有利；業者分類依能源署名單，有更新時間差。</li>
  </ul>
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
  <h3>Electricity price and wheeling rate data</h3>
  <ul>
    <li>The figures on the <a href="#price">electricity prices</a> and <a href="#wheeling">wheeling rates</a> pages are compiled by hand from public data published by Taipower and the Energy Administration (Ministry of Economic Affairs). They are not collected automatically.</li>
    <li><b>Average unit price</b> = electricity revenue ÷ kWh sold. It is an actual result, not a tariff rate. Source: Taipower, average unit price by year.</li>
    <li><b>Unit cost of electricity sold</b> is combined from three official sources (Legislative Yuan Budget Center, Control Yuan report, and Taipower's comparison of price and unit cost structure), so the source differs by year. The 2023 figure has only two decimal places and is shown as published.</li>
    <li><b>Wheeling rates</b> are recorded from 2019 and follow Taipower's yearly announcement of transmission and distribution rates (the original PDF for each year can be opened on the wheeling rates page). The announced rates include 5% business tax; this site stores them excluding tax: every year is the announced rate ÷ 1.05 (rounded to 4 decimal places), and the total is the sum of the four announced rates ÷ 1.05.</li>
    <li><b>Required unit price</b> is Taipower's estimate of the price level under the price formula (submitted to the review committee; not an actual price). It is compiled meeting by meeting from Taipower's slides for each Energy Administration price review meeting since 2015 (23 meetings). For four meetings in 2023–2024 Taipower's slides do not state the figure, only total cost and electricity sold, so it is calculated as total cost ÷ electricity sold. No figure was submitted in 2017, and 2015–2016 used the old price formula.</li>
    <li><b>Including or excluding tax:</b> all figures are stored excluding tax; including tax = excluding tax × 1.05. Taipower does not state whether the average unit price includes tax. This site treats it as excluding tax based on three pieces of evidence: (1) it almost matches the "average price per kWh" in the final accounts, whose operating revenue excludes business tax; (2) the average price published by the review committee is about 5% below the tax-inclusive tariff; (3) the wheeling rate formula states that "results exclude business tax, which is added when the rates are announced". The unit cost has no tax component and does not change with the toggle.</li>
    <li><b>Update frequency:</b> average unit price yearly, unit cost monthly, wheeling rates every December, price adjustments after the March and September reviews.</li>
  </ul>
</section>

<section class="card prose">
  <h3>Company rankings</h3>
  <ul>
    <li>The <a href="#companies">Companies</a> page ranks the top 20 renewable electricity retailers and generators (Taipower excluded) by summing <b>direct-supply certificate transfers</b> since 2020 by <b>seller</b>, using public data from T-REC (National Renewable Energy Certification Center). Certificate holders are not used because the holder and the seller are not always the same company.</li>
    <li>Whether a company is a retailer or a generator follows the Energy Administration's published lists. Greater Changhua Northwest offshore wind is not yet on the power plant list; this site lists it as a generator based on its actual operation and marks it.</li>
    <li>Energy type, number of plants and capacity are based on the plants the company has sold from; capacity is matched to issued certificates by plant ID.</li>
    <li>Updated automatically on the 15th of each month, fetching this year and last year again. Each update checks row counts, T-REC's published totals, and that issued = direct supply + self-use + not yet transferred; if anything does not match, the update is skipped.</li>
    <li><b>Limitations:</b> generators that let a retailer manage their certificates are not visible; most large offshore wind farms sell to Taipower under feed-in tariffs and have no certificates; totals favour companies that started earlier; classification follows the Energy Administration's lists, which are updated with some delay.</li>
  </ul>
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
