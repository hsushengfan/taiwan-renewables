# 機組中英文名稱對照表

網站英文版顯示的機組名稱。資料來源是資料庫的 `units.name_en`（定義在 `supabase/migrations/005_website_api.sql`）。

**命名方式**

- **台電的傳統電廠**：電廠名稱用台電慣用的拼法（例如 Hsinta、Techi），加上機組編號。
- **離岸風場**：用開發商公布的英文案名。
- **民營電廠、太陽能案場、陸域風場**：用拼音。
- **合併的項目**（例如「其它購電太陽能」）：直接翻譯意思。

**確認狀態**：2026-11-13 全部 191 個名稱已由使用者確認。

要修改名稱：告訴 Claude 要改哪幾個，會同時更新資料庫和這份文件。

資料時間：2026-11-13 22:20（台灣時間）。共 191 個機組。

## 燃煤 Coal（17 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 台中#10 | Taichung #10 | 550 |  |
| 台中#3 | Taichung #3 | 550 |  |
| 台中#4 | Taichung #4 | 550 |  |
| 台中#5 | Taichung #5 | 550 |  |
| 台中#6 | Taichung #6 | 550 |  |
| 台中#7 | Taichung #7 | 550 |  |
| 台中#8 | Taichung #8 | 550 |  |
| 台中#9 | Taichung #9 | 550 |  |
| 大林#1 | Talin #1 | 800 |  |
| 大林#2 | Talin #2 | 800 |  |
| 林口#1 | Linkou #1 | 800 |  |
| 林口#2 | Linkou #2 | 800 |  |
| 林口#3 | Linkou #3 | 800 |  |
| 興達#1 | Hsinta #1 | — |  |
| 興達#2 | Hsinta #2 | — |  |
| 興達#3 | Hsinta #3 | — |  |
| 興達#4 | Hsinta #4 | 550 |  |

## 民營燃煤 IPP Coal（2 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 和平#1 | Hoping #1 | 648.6 | 民營電廠 |
| 和平#2 | Hoping #2 | 660 | 民營電廠 |

## 燃氣 Gas（30 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 南部CC#1 | Nanpu CC #1 | 288.8 |  |
| 南部CC#2 | Nanpu CC #2 | 288.8 |  |
| 南部CC#3 | Nanpu CC #3 | 288.8 |  |
| 南部CC#4 | Nanpu CC #4 | 251.4 |  |
| 台中CC#1 | Taichung CC #1 | 1,298.2 |  |
| 台中CC#2 | Taichung CC #2 | — |  |
| 大林#5 | Talin #5 | — |  |
| 大林#6 | Talin #6 | 550 |  |
| 大潭CC#1 | Datan CC #1 | 742.7 |  |
| 大潭CC#2 | Datan CC #2 | 742.7 |  |
| 大潭CC#3 | Datan CC #3 | 724.7 |  |
| 大潭CC#4 | Datan CC #4 | 724.7 |  |
| 大潭CC#5 | Datan CC #5 | 724.7 |  |
| 大潭CC#6 | Datan CC #6 | 724.7 |  |
| 大潭CC#7 | Datan CC #7 | 913.1 |  |
| 大潭CC#8 | Datan CC #8 | 1,123.6 |  |
| 大潭CC#9 | Datan CC #9 | 1,123.6 |  |
| 興達CC#1 | Hsinta CC #1 | 445.2 |  |
| 興達CC#2 | Hsinta CC #2 | 445.2 |  |
| 興達CC#3 | Hsinta CC #3 | 445.2 |  |
| 興達CC#4 | Hsinta CC #4 | 445.2 |  |
| 興達CC#5 | Hsinta CC #5 | 445.2 |  |
| 興達新CC#1 | Hsinta New CC #1 | 1,300 |  |
| 興達新CC#2 | Hsinta New CC #2 | — |  |
| 興達新CC#3 | Hsinta New CC #3 | — |  |
| 通霄CC#1 | Tongxiao CC #1 | 892.6 |  |
| 通霄CC#2 | Tongxiao CC #2 | 892.6 |  |
| 通霄CC#3 | Tongxiao CC #3 | 892.6 |  |
| 通霄CC#6 | Tongxiao CC #6 | 321.2 |  |
| 通霄GT#9 | Tongxiao GT #9 | 180.9 |  |

## 民營燃氣 IPP Gas（11 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 嘉惠#1 | Chiahui #1 | 700 | 民營電廠 |
| 嘉惠#2 | Chiahui #2 | 510 | 民營電廠 |
| 國光#1 | Kuokuang #1 | 480 | 民營電廠 |
| 新桃#1 | Hsintao #1 | 630 | 民營電廠 |
| 星元#1 | Hsingyuan #1 | 549.1 | 民營電廠 |
| 星彰#1 | Hsingchang #1 | 506.9 | 民營電廠 |
| 海湖#1 | Haihu #1 | 450 | 民營電廠 |
| 海湖#2 | Haihu #2 | 450 | 民營電廠 |
| 豐德#1 | Fengte #1 | 506.9 | 民營電廠 |
| 豐德#2 | Fengte #2 | 506.9 | 民營電廠 |
| 豐德#3 | Fengte #3 | 1,100 | 民營電廠 |

## 其它火力 Other Thermal（13 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 汽電共生 | Cogeneration | 627.3 | 多家汽電共生廠的合計 |
| 協和#3 | Hsiehho #3 | 500 | 台電分類：燃料油 |
| 協和#4 | Hsiehho #4 | 500 | 台電分類：燃料油 |
| 台中Gas1&2 | Taichung Gas Turbine 1&2 | 140 | 台電分類：燃料油 |
| 台中Gas3&4 | Taichung Gas Turbine 3&4 | 140 | 台電分類：燃料油 |
| 核三Gas1 | Maanshan Gas Turbine 1 | — | 台電分類：燃料油 |
| 核三Gas2 | Maanshan Gas Turbine 2 | — | 台電分類：燃料油 |
| 核二Gas1 | Kuosheng Gas Turbine 1 | — | 台電分類：燃料油 |
| 核二Gas2 | Kuosheng Gas Turbine 2 | — | 台電分類：燃料油 |
| 澎湖尖山 | Penghu Chienshan | 129.8 | 台電分類：燃料油 |
| 金門塔山 | Kinmen Tashan | 113.3 | 台電分類：燃料油 |
| 離島其它 | Other Outlying Islands | 44.2 | 台電分類：燃料油 |
| 馬祖珠山 | Matsu Chushan | 28.6 | 台電分類：燃料油 |

## 儲能 Storage（11 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 大觀二#1 | Takuan 2 #1 | 250 |  |
| 大觀二#2 | Takuan 2 #2 | 250 |  |
| 大觀二#3 | Takuan 2 #3 | 250 |  |
| 大觀二#4 | Takuan 2 #4 | 250 |  |
| 明潭#1 | Mingtan #1 | 267 |  |
| 明潭#2 | Mingtan #2 | 267 |  |
| 明潭#3 | Mingtan #3 | 267 |  |
| 明潭#4 | Mingtan #4 | 267 |  |
| 明潭#5 | Mingtan #5 | 267 |  |
| 明潭#6 | Mingtan #6 | 267 |  |
| 電池 | Battery Storage | 863.4 |  |

## 水力 Hydro（52 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 中部小水力 | Central Small Hydro | 31.3 | 多個機組的合計 |
| 其它購電小水力 | Other Purchased Small Hydro | 6.1 | 多個機組的合計 |
| 北部小水力 | Northern Small Hydro | 31.1 | 多個機組的合計 |
| 卑南 | Peinan | 2 |  |
| 卓蘭#1 | Cholan #1 | 40 |  |
| 卓蘭#2 | Cholan #2 | 40 |  |
| 南部小水力 | Southern Small Hydro | 7.2 | 多個機組的合計 |
| 名間 | Mingchien | 16.7 |  |
| 嘉南西口、烏山頭和八田 | Chianan Hsikou, Wushantou & Hatta | 13.7 |  |
| 大觀一#1 | Takuan 1 #1 | 22 |  |
| 大觀一#2 | Takuan 1 #2 | 22 |  |
| 大觀一#3 | Takuan 1 #3 | 22 |  |
| 大觀一#4 | Takuan 1 #4 | 22 |  |
| 大觀一#5 | Takuan 1 #5 | 22 |  |
| 天輪#1 | Tienlun #1 | 22.5 |  |
| 天輪#2 | Tienlun #2 | 22.5 |  |
| 天輪#3 | Tienlun #3 | 22.5 |  |
| 天輪#4 | Tienlun #4 | 22.5 |  |
| 天輪#5 | Tienlun #5 | 105 |  |
| 德基#1 | Techi #1 | 78 |  |
| 德基#2 | Techi #2 | 78 |  |
| 德基#3 | Techi #3 | 78 |  |
| 捷祥關山 | Chiehhsiang Kuanshan | 1 |  |
| 曾文#1 | Tsengwen #1 | 50 |  |
| 東部小水力 | Eastern Small Hydro | 54.6 | 多個機組的合計 |
| 松林#1&2 | Sunglin #1&2 | 20.9 |  |
| 水里#1 | Shuili #1 | 12.8 |  |
| 烏來&桂山&粗坑 | Wulai & Kueishan & Tsukeng | 40.5 |  |
| 石門#1 | Shihmen #1 | 45 |  |
| 石門#2 | Shihmen #2 | 45 |  |
| 碧海 | Pihai | 61.2 |  |
| 萬大#1 | Wanta #1 | 10.4 |  |
| 萬大#2 | Wanta #2 | 10.4 |  |
| 萬大#3 | Wanta #3 | 15.3 |  |
| 萬大#4 | Wanta #4 | 19.7 |  |
| 立霧#1&#2 | Liwu #1&#2 | 32 |  |
| 義興#1 | Yihsing #1 | 40 |  |
| 翡翠#1 | Feitsui #1 | 70 |  |
| 谷關#1 | Kukuan #1 | 54.4 |  |
| 谷關#2 | Kukuan #2 | 54.4 |  |
| 谷關#3 | Kukuan #3 | 54.4 |  |
| 谷關#4 | Kukuan #4 | 54.4 |  |
| 鉅工#1 | Chukung #1 | 21.8 |  |
| 鉅工#2 | Chukung #2 | 21.8 |  |
| 青山#1 | Chingshan #1 | 92 |  |
| 青山#2 | Chingshan #2 | 92 |  |
| 青山#3 | Chingshan #3 | 92 |  |
| 青山#4 | Chingshan #4 | 92 |  |
| 馬鞍#1 | Maan #1 | 66.7 |  |
| 馬鞍#2 | Maan #2 | 66.7 |  |
| 龍澗#1 | Lungchien #1 | 48.6 |  |
| 龍澗#2 | Lungchien #2 | 48.6 |  |

## 其它再生能源 Other Renewables（3 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 台電自有地熱 | Taipower Geothermal | 0.84 |  |
| 生質能(Biofuel) | Biomass | 60.7 |  |
| 購電地熱 | Purchased Geothermal | 6.449 |  |

## 太陽能 Solar（21 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 其它台電自有 | Other Taipower-owned Solar | 24.3 | 多個機組的合計 |
| 其它購電太陽能 | Other Purchased Solar | 15,112.3 | 多個機組的合計 |
| 南鹽光 | Nanyan Solar | 150 |  |
| 向陽光 | Xiangyang Solar | — |  |
| 天篷光 | Tianpeng Solar | 80 |  |
| 天英光 | Tianying Solar | — |  |
| 天衝光 | Tianchong Solar | — |  |
| 寶興光 | Baoxing Solar | — |  |
| 崙尾光 | Lunwei Solar | — |  |
| 廷和光 | Tinghe Solar | — |  |
| 彰濱光 | Changbin Solar | 100 |  |
| 志光光 | Zhiguang Solar | — |  |
| 新和光 | Xinhe Solar | — |  |
| 星崙光 | Xinglun Solar | — |  |
| 星崴光 | Xingwei Solar | — |  |
| 星股光 | Xinggu Solar | — |  |
| 昱昶光 | Yuchang Solar | — |  |
| 永堯光 | Yongyao Solar | — |  |
| 生利光 | Shengli Solar | — |  |
| 碩力光 | Shuoli Solar | — |  |
| 聯華光 | Lianhua Solar | — |  |

## 陸域風電 Onshore Wind（15 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 中威大安 | Zhongwei Da'an | 75.9 |  |
| 其它台電自有 | Other Taipower-owned Wind | 84.7 | 多個機組的合計 |
| 其它購電風力 | Other Purchased Wind | 178.4 | 多個機組的合計 |
| 創維風 | Chuangwei | 49.2 |  |
| 台中港 | Taichung Harbor | 35 |  |
| 四湖 | Sihu | 28 |  |
| 彰品風 | Zhangpin | — |  |
| 彰工 | Changgong | 86.2 |  |
| 新源崙背 | Xinyuan Lunbei | 25.2 |  |
| 王功 | Wanggong | 23 |  |
| 苗栗大鵬 | Miaoli Dapeng | 42 |  |
| 觀園 | Guanyuan | 30 |  |
| 觀威觀音&桃威新屋 | Guanwei Guanyin & Taowei Xinwu | 48.3 |  |
| 雲麥 | Yunmai | 46 |  |
| 鹿威彰濱 | Luwei Changbin | 55.2 |  |

## 離岸風電 Offshore Wind（16 個）

| 中文 | 英文 | 裝置容量 (MW) | 說明 |
|---|---|---:|---|
| 中能風 | Zhong Neng | 294.5 | 中能離岸風場 |
| 允湖 | Yunlin (Yunhu) | 320 | 允能雲林離岸風場 |
| 允西 | Yunlin (Yunxi) | 320 | 允能雲林離岸風場 |
| 沃一風 | Greater Changhua 1 | 605.2 | 大彰化東南（第一期） |
| 沃二風 | Greater Changhua 2a | 294.8 | 大彰化西南 2a |
| 沃南風 | Greater Changhua 2b | 337.1 | 大彰化西南 2b |
| 沃四風 | Greater Changhua 4 | — | 台電沒有提供裝置容量 |
| 海洋竹南 | Formosa 1 | 128 | 海洋風場（Formosa 1） |
| 海能風 | Formosa 2 | 376 | 海能風場（Formosa 2） |
| 芳一風 | Changfang & Xidao 1 | 96 | 彰芳暨西島離岸風場 |
| 芳二風 | Changfang & Xidao 2 | 499.2 | 彰芳暨西島離岸風場 |
| 離岸一期 | Taipower Offshore Phase 1 | 109.2 | 台電離岸風電第一期 |
| 離岸二期 | Taipower Offshore Phase 2 | — | 台電離岸風電第二期 |
| 龍A風 | Hai Long 2A | — | 海龍二號 A |
| 龍B風 | Hai Long 2B | — | 海龍二號 B |
| 龍三風 | Hai Long 3 | — | 海龍三號 |
