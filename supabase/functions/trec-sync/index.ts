// =====================================================================
// Edge Function「trec-sync」：從 T-REC（國家再生能源憑證中心）抓憑證資料，存進 Supabase
//
// 會被 pg_cron 每月 15 日台北時間 03:17 呼叫一次（排程見 supabase/migrations/016_trec_schedule.sql）。
// 規格見 docs/specs/companies.md。每次做的事：
//   1. 打開 T-REC 的頁面，拿到 cookie 和 _token（T-REC 會檢查這兩個，沒有的話資料介面會擋掉）
//   2. 抓「今年和去年」的三份資料：已發放憑證、直轉供成交紀錄、自用發電設備成交紀錄
//      （去年也要重抓，因為 T-REC 會補發、補登）。每份資料每一年只用一個請求抓完：
//      T-REC 分頁時排序不固定，分頁抓會重複和漏掉。
//   3. 驗算每一年：筆數等於 T-REC 說的筆數、沒有重複列、加總等於 T-REC 公布的總量（差 1 MWh 以內），
//      而且「已發放 ＝ 直轉供 ＋ 自用 ＋ 尚未移轉」。
//   4. 全部通過才寫進資料庫（先放暫存區，再由資料庫的 trec_commit() 一次換掉那幾年的資料）；
//      任何一項不符，就不動舊資料，寄信通知。
//   5. 如果有新業者的累計量大到可能擠進前 20 名，把它加進 companies（分類＝pending，等確認），寄信通知。
//
// 手動執行時可以指定年份，例如第一次全部匯入：{"years": [2020, 2021, 2022, 2023]}。
// 這個函式會先回覆「已開始」，再在背景慢慢抓（全部做完約 1 分鐘），結果記在 trec_sync_runs 資料表。
//
// 需要的設定：和 collect 共用 RESEND_API_KEY、NOTIFY_EMAIL（Edge Functions → Secrets），不用另外設定。
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.trec.org.tw";
const SITE_URL = "https://hsushengfan.github.io/taiwan-renewables/";
const USER_AGENT = `taiwan-renewables monthly sync (+${SITE_URL})`;
const PAUSE_MS = 700;        // 每個請求之間休息 0.7 秒，不要對 T-REC 造成負擔
const TOLERANCE = 1;         // 加總和公布值差 1 MWh 以內算相符
const FIRST_YEAR = 2020;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// T-REC 的數字是字串，大於 1,000 的有千分位逗號（例如 "1,234.5"），一定要先拿掉逗號再轉數字
const num = (s: unknown) => (s == null || s === "" ? 0 : Number(String(s).replace(/,/g, "")));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
// 拿掉 HTML 標籤，回傳裡面的每一段文字。例如出售單位欄 "<div>A公司<div>B案場</div></div>" → ["A公司", "B案場"]
const texts = (html: unknown) => String(html ?? "").split(/<[^>]+>/).map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------
// 1. 連上 T-REC：拿 cookie、_token，以及頁面上最新可以選的年份和月份
// ---------------------------------------------------------------------
type Session = { cookie: string; token: string; latestYear: number; asOf: string };

async function openSession(): Promise<Session> {
  const resp = await fetch(`${BASE}/certification`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`打開 T-REC 頁面失敗：HTTP ${resp.status}`);
  const html = await resp.text();
  const token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1];
  // 頁面裡的表格設定，例如 "data":{"year":"2026","date":"2026-11"}：今年和目前最新的月份
  const m = html.match(/"data":\{"year":"(\d{4})","date":"(\d{4}-\d{2})"\}/);
  if (!token || !m) throw new Error("T-REC 頁面的格式變了，找不到 _token 或最新月份");
  const cookie = resp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { cookie, token, latestYear: Number(m[1]), asOf: m[2] };
}

// 向 T-REC 的資料介面要一整年的資料（length 設得比一年的筆數大很多，一次抓完）
async function fetchTable(s: Session, path: string, fields: Record<string, string>) {
  const body = new URLSearchParams({ draw: "1", start: "0", length: "50000", _token: s.token, ...fields });
  const resp = await fetch(`${BASE}${path}/data`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT, Cookie: s.cookie, "X-CSRF-TOKEN": s.token, "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}${path}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`${path} 被擋或失敗：HTTP ${resp.status}`);
  const j = await resp.json();
  await sleep(PAUSE_MS);
  return j as { recordsFiltered: number; data: Record<string, unknown>[]; year_power?: string; year_count?: { total_power?: string } };
}

// ---------------------------------------------------------------------
// 2. 抓一年的三份資料，整理成和資料表一樣的欄位，並驗算
// ---------------------------------------------------------------------
type YearData = { year: number; cert: Record<string, unknown>[]; direct: Record<string, unknown>[]; self: Record<string, unknown>[]; totals: Record<string, number>; problems: string[] };

async function fetchYear(s: Session, year: number): Promise<YearData> {
  const date = year === s.latestYear ? s.asOf : `${year}-12`;   // 過去的年份用 12 月；今年用最新的月份
  const c = await fetchTable(s, "/certification", { year: String(year), date });
  // 成交紀錄的年份要放在 search[year]（只放 year= 會被忽略，永遠回傳今年）
  const d = await fetchTable(s, "/certification_trade_situation/direct_supply", { "search[year]": String(year) });
  const u = await fetchTable(s, "/certification_trade_situation", { "search[year]": String(year) });

  const cert = c.data.map((r) => ({
    case_id: Number(r.id), holder_name: String(r.user_name), case_name: String(r.case_name), energy: r.energy,
    capacity_kw: r.total_capacity === "" || r.total_capacity == null ? null : num(r.total_capacity),
    issued_mwh: num(r.traded_power) + num(r.remaining_power), traded_mwh: num(r.traded_power), remaining_mwh: num(r.remaining_power),
  }));
  const direct = d.data.map((r) => ({
    seller_id: Number(r.seller), buyer_id: Number(r.buyer), case_id: Number(r.case_id),
    seller_name: texts(r.seller_name)[0] ?? "", buyer_name: String(r.buyer_name), owner: r.owner, case_name: r.case_name,
    energy: r.energy, parallel_type: r.parallel_type, power_mwh: num(r.power),
  }));
  const self = u.data.map((r) => ({
    seller_name: texts(r.seller_name)[0] ?? "", buyer_name: String(r.buyer_name), case_name: r.case_name,
    energy: r.energy, power_mwh: num(r.power), traded_on: r.created_at ?? "",
  }));

  const sum = (rows: Record<string, unknown>[], k: string) => round3(rows.reduce((a, r) => a + Number(r[k] ?? 0), 0));
  const totals = {
    year,
    cert_published: num(c.year_power), cert_sum: sum(cert, "issued_mwh"), cert_rows: cert.length, remaining_sum: sum(cert, "remaining_mwh"),
    direct_published: num(d.year_count?.total_power), direct_sum: sum(direct, "power_mwh"), direct_rows: direct.length,
    self_published: num(u.year_count?.total_power), self_sum: sum(self, "power_mwh"), self_rows: self.length,
  };

  // ---- 驗算 ----
  const problems: string[] = [];
  const check = (label: string, ok: boolean, detail: string) => { if (!ok) problems.push(`${year} ${label}：${detail}`); };
  check("已發放憑證筆數", cert.length === c.recordsFiltered, `抓到 ${cert.length} 筆，T-REC 說有 ${c.recordsFiltered} 筆`);
  check("直轉供筆數", direct.length === d.recordsFiltered, `抓到 ${direct.length} 筆，T-REC 說有 ${d.recordsFiltered} 筆`);
  check("自用發電設備筆數", self.length === u.recordsFiltered, `抓到 ${self.length} 筆，T-REC 說有 ${u.recordsFiltered} 筆`);
  const dup = (keys: string[]) => keys.length - new Set(keys).size;
  check("已發放憑證重複", dup(cert.map((r) => String(r.case_id))) === 0, `${dup(cert.map((r) => String(r.case_id)))} 筆重複的案場編號`);
  const dKeys = direct.map((r) => `${r.seller_id}|${r.buyer_id}|${r.case_id}`);
  check("直轉供重複", dup(dKeys) === 0, `${dup(dKeys)} 筆重複`);
  const uKeys = u.data.map((r) => JSON.stringify(r));
  check("自用發電設備重複", dup(uKeys) === 0, `${dup(uKeys)} 筆完全相同的列`);
  check("已發放憑證加總", Math.abs(totals.cert_sum - totals.cert_published) <= TOLERANCE, `加總 ${totals.cert_sum}，T-REC 公布 ${totals.cert_published}`);
  check("直轉供加總", Math.abs(totals.direct_sum - totals.direct_published) <= TOLERANCE, `加總 ${totals.direct_sum}，T-REC 公布 ${totals.direct_published}`);
  check("自用發電設備加總", Math.abs(totals.self_sum - totals.self_published) <= TOLERANCE, `加總 ${totals.self_sum}，T-REC 公布 ${totals.self_published}`);
  const identity = round3(totals.cert_sum - totals.direct_sum - totals.self_sum - totals.remaining_sum);
  check("已發放＝直轉供＋自用＋尚未移轉", Math.abs(identity) <= TOLERANCE, `差 ${identity} MWh`);
  check("出售單位名稱", direct.every((r) => r.seller_name), "有成交紀錄找不到出售單位名稱（T-REC 的格式可能變了）");

  return { year, cert, direct, self, totals, problems };
}

// ---------------------------------------------------------------------
// 3. 寫進資料庫：先分批放進暫存區，再呼叫 trec_commit() 一次換掉
// ---------------------------------------------------------------------
async function save(runId: number, asOf: string, years: YearData[]) {
  for (const y of years) {
    for (const [dataset, rows] of [["cert", y.cert], ["direct", y.direct], ["self", y.self]] as const) {
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000).map((row) => ({ run_id: runId, dataset, year: y.year, row }));
        const { error } = await supabase.from("trec_staging").insert(chunk);
        if (error) throw new Error(`寫入暫存區失敗：${error.message}`);
      }
    }
  }
  const { error } = await supabase.rpc("trec_commit", { p_run_id: runId, p_as_of: asOf, p_totals: years.map((y) => y.totals) });
  if (error) throw new Error(`trec_commit 失敗：${error.message}`);
}

// ---------------------------------------------------------------------
// 4. 找可能擠進前 20 名的新業者
//    門檻＝售電業、發電業兩份排名第 20 名中比較小的那個（新業者還不知道是哪一類）
//    資料庫要有 2020 年到今年的每一年才檢查：第一次分批匯入、只匯入一部分年份時，
//    累計量還不完整，門檻會算得太低，把很多小業者誤判成新進前 20 名。
// ---------------------------------------------------------------------
async function findNewCompanies(latestYear: number): Promise<{ name: string; sold_mwh: number }[] | null> {
  const { data: have, error: e0 } = await supabase.from("trec_year_totals").select("year");
  if (e0) throw new Error(`讀年份失敗：${e0.message}`);
  const got = new Set((have ?? []).map((r) => Number(r.year)));
  for (let y = FIRST_YEAR; y <= latestYear; y++) if (!got.has(y)) return null;   // 年份還不齊，先不檢查
  const { data: twentieth, error: e1 } = await supabase.from("company_rankings").select("role, cum_mwh").eq("rank", 20);
  if (e1) throw new Error(`讀排名失敗：${e1.message}`);
  const threshold = Math.min(...(twentieth ?? []).map((r) => Number(r.cum_mwh)), Infinity);
  if (!isFinite(threshold)) return [];
  const { data, error } = await supabase.from("trec_unknown_sellers").select("name, sold_mwh").gte("sold_mwh", threshold);
  if (error) throw new Error(`讀新業者失敗：${error.message}`);
  const found = (data ?? []).map((r) => ({ name: String(r.name), sold_mwh: Number(r.sold_mwh) }));
  if (found.length) {
    // 加進 companies，分類先設成 pending（不列入排名），下次就不會再通知同一家
    const { error: e2 } = await supabase.from("companies").upsert(
      found.map((f) => ({ name_zh: f.name, short_name_zh: f.name.replace(/股份有限公司$|有限公司$/, ""), role: "pending", note_zh: "自動抓取時發現，等確認是售電業或發電業" })),
      { onConflict: "name_zh", ignoreDuplicates: true },
    );
    if (e2) throw new Error(`新增待確認業者失敗：${e2.message}`);
  }
  return found;
}

async function sendEmail(subject: string, html: string): Promise<string> {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) return "（沒有設定 RESEND_API_KEY 或 NOTIFY_EMAIL，沒有寄信）";
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Taiwan Power Site <onboarding@resend.dev>", to: [NOTIFY_EMAIL], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    return resp.ok ? "已寄信" : `寄信失敗：HTTP ${resp.status}`;
  } catch (e) {
    return `寄信失敗：${e}`;
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// ---------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------
async function run(requestedYears: number[] | null) {
  const { data: runRow, error } = await supabase.from("trec_sync_runs").insert({ status: "running" }).select("id").single();
  if (error) { console.error(error); return; }
  const runId = Number(runRow.id);
  const finish = (status: "ok" | "failed", message: string, extra: Record<string, unknown> = {}) =>
    supabase.from("trec_sync_runs").update({ status, message, ...extra }).eq("id", runId);

  let years: number[] = [];
  let asOf = "";
  try {
    const s = await openSession();
    asOf = s.asOf;
    if (requestedYears?.length) years = requestedYears;
    else {
      // 平常只抓今年和去年；資料庫還是空的（第一次）就從 2020 年抓起
      const { count } = await supabase.from("trec_year_totals").select("year", { count: "exact", head: true });
      years = count ? [s.latestYear - 1, s.latestYear] : Array.from({ length: s.latestYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
    }
    years = years.filter((y) => y >= FIRST_YEAR && y <= s.latestYear);
    await supabase.from("trec_sync_runs").update({ years, as_of: asOf }).eq("id", runId);

    const results: YearData[] = [];
    for (const y of years) results.push(await fetchYear(s, y));
    const problems = results.flatMap((r) => r.problems);
    if (problems.length) {
      const mail = await sendEmail("【台灣電力網站】T-REC 資料驗算不符，這次沒有更新",
        `<p>T-REC 每月同步（資料到 ${escape(asOf)}）驗算不符，<b>資料庫維持舊資料，沒有更新</b>：</p><ul>${problems.map((p) => `<li>${escape(p)}</li>`).join("")}</ul>` +
        `<p>可能是 T-REC 正在更新資料，或網站格式改了。可以過幾天在 SQL Editor 手動再執行一次（見 docs/supabase-setup.md）。</p>`);
      await finish("failed", `驗算不符：${problems.join("；")}　${mail}`);
      return;
    }

    await save(runId, asOf, results);
    const found = await findNewCompanies(s.latestYear);
    let mail = "";
    if (found?.length) {
      mail = await sendEmail(`【台灣電力網站】T-REC 有 ${found.length} 家新業者可能擠進前 20 名`,
        `<p>這些出售單位還不在業者名單裡，累計直轉供移轉量已經達到前 20 名的門檻。請確認它們是售電業、發電業，還是不列入排名：</p>` +
        `<table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>名稱</th><th>累計移轉（MWh）</th></tr>` +
        found.map((f) => `<tr><td>${escape(f.name)}</td><td align="right">${fmt(f.sold_mwh)}</td></tr>`).join("") + `</table>` +
        `<p>它們已經先加進 companies 資料表，分類是 pending（待確認，不列入排名）。確認後告訴 Claude，或在 SQL Editor 改 role。</p>` +
        `<p><a href="${SITE_URL}#companies">${SITE_URL}#companies</a></p>`);
    }
    const counts = results.map((r) => `${r.year}：憑證 ${r.cert.length}、直轉供 ${r.direct.length}、自用 ${r.self.length} 筆`).join("；");
    await finish("ok", `已更新 ${counts}` + (found === null ? "。年份還不齊，這次不檢查新業者" : found.length ? `。新業者 ${found.length} 家，${mail}` : ""));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const mail = await sendEmail("【台灣電力網站】T-REC 每月同步失敗",
      `<p>T-REC 每月同步失敗，資料庫維持舊資料：</p><p>${escape(msg)}</p><p>如果是被 T-REC 擋掉（HTTP 403 或 419），請告訴 Claude，改用手動下載 CSV 的備案。</p>`);
    await finish("failed", `${msg}　${mail}`, { years, as_of: asOf || null });
  }
}

Deno.serve(async (req) => {
  // 只接受 POST（排程和後台的 Test 按鈕都是 POST），用瀏覽器打開網址之類的請求不會觸發抓取
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let years: number[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.years)) years = body.years.map(Number).filter(Number.isInteger);
  } catch { /* 沒有 body 就用預設的年份 */ }
  // 抓資料要一陣子，先回覆「已開始」，再在背景做完（結果看 trec_sync_runs 資料表）
  // @ts-ignore EdgeRuntime 是 Supabase 提供的
  EdgeRuntime.waitUntil(run(years));
  return new Response(JSON.stringify({ started: true, years }), { status: 202, headers: { "Content-Type": "application/json" } });
});
