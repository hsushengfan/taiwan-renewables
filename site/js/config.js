// 網站連到 Supabase 需要的兩個設定。
//
// ANON_KEY 是「可以公開」的金鑰：它只能呼叫 api_ 開頭的函式來讀資料，
// 不能直接讀寫資料表，所以放在公開的網站程式碼裡沒有問題。
// （secret 金鑰絕對不能放在這裡。）
export const SUPABASE_URL = "https://xncisuhbbchycwvpedxd.supabase.co";
export const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuY2lzdWhiYmNoeWN3dnBlZHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTc4OTksImV4cCI6MjEwOTg5Mzg5OX0.ztw9L74sm50aUomzqM-jSHV8z7JKoO9rqfGD-mC6UUY";

// 每隔多久重新讀一次資料（毫秒）。台電每 10 分鐘更新，這裡每 3 分鐘檢查一次。
export const REFRESH_MS = 3 * 60 * 1000;

// 瀏覽人數統計（GoatCounter）。填入你在 goatcounter.com 註冊的網站代號，
// 例如註冊的網址是 https://twpower.goatcounter.com，這裡就填 "twpower"。
// 空字串＝不統計。
export const GOATCOUNTER_CODE = "twpower";
