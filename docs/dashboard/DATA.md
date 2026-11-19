# 股票儀表板 資料格式

所有檔案位於 `dashboard/data/`，由 `scripts/dashboard/build_data.py` 自動產生（GitHub Actions，每交易日 15:47、21:47 台北時間）。
**不要手動修改。** 數值缺漏一律為 `null`。日期格式 `YYYY-MM-DD`，月份 `YYYY-MM`。來源：臺灣證券交易所。

## meta.json

```json
{
  "updated": "2026-11-19T08:19:14+00:00",
  "latest": { "prices": "2026-11-19", "valuation": "2026-11-18", "institutional": "2026-11-18", "margin": "2026-11-18", "revenue": "2026-10" },
  "stocks": [ { "symbol": "2330", "name": "台積電", "group": "main" } ],
  "source": "臺灣證券交易所盤後資料"
}
```
`group`：`main` 主要、`watch` 觀察。前端請用 `ctx.stocks`（已套用篩選），不要直接讀這裡。

## prices.json — 每日股價（約 6 個月起，逐日累積，最多 260 天）

```json
{ "symbols": { "2330": { "name": "台積電", "rows": [
  { "date": "2026-11-19", "open": 2150, "high": 2170, "low": 2095, "close": 2100,
    "change": -75, "pct": -3.45, "volume": 52134, "ex": true }
] } } }
```
- `change`：漲跌（元），`pct`：漲跌幅（%），以參考價計算，除權息日也正確。
- `volume`：成交量（**張**）。`ex: true` 只在除權息日出現。
- 各檔 `rows` 依日期遞增；停牌日可能缺。

## valuation.json — 最新估值（每日更新為最近一個有資料的交易日）

```json
{ "date": "2026-11-18", "items": [
  { "symbol": "2330", "name": "台積電", "close": 2175, "pe": 22.14, "dividendYield": 1.01, "pb": 8.06,
    "dividendYear": 114, "reportPeriod": "115/3" }
] }
```
- `pe` 本益比（虧損時為 `null`）、`dividendYield` 殖利率（%）、`pb` 股價淨值比。
- `dividendYear` 股利所屬民國年度，`reportPeriod` 財報期別（民國年/季）。

## institutional.json — 三大法人買賣超（最近 20 個交易日，單位：**張**）

```json
{ "dates": ["2026-10-21", "…", "2026-11-18"],
  "items": { "2330": [ { "date": "2026-11-18", "foreign": -15453, "trust": 3383, "dealer": 5185, "total": -6885 } ] },
  "byDate": { "…": "內部快取，前端不要用" } }
```
- `foreign` 外資（含外資自營商）、`trust` 投信、`dealer` 自營商（自行買賣＋避險）、`total` 三大法人合計。正數＝買超。

## margin.json — 融資融券（最近 20 個交易日，單位：**張**）

```json
{ "dates": ["…"],
  "items": { "2330": [ { "date": "2026-11-18", "marginBuy": 1070, "marginSell": 578, "marginBalance": 33228, "marginChange": 402,
                         "shortSell": 2, "shortBalance": 24, "shortChange": -12, "offset": 6 } ] },
  "byDate": { "…": "內部快取，前端不要用" } }
```
- `marginBalance` 融資餘額、`marginChange` 融資增減（今日－前日）。
- `shortBalance` 融券餘額、`shortChange` 融券增減。`offset` 資券互抵。
- 券資比可自行計算：`shortBalance / marginBalance * 100`。

## revenue.json — 月營收（每月公布後累積，最多 24 個月；**目前只有最新一個月**，歷史會逐月累積）

```json
{ "months": ["2026-10"],
  "items": { "2330": [ { "month": "2026-10", "revenue": 586890319, "mom": 14.66, "yoy": 59.71,
                         "cumRevenue": 4485617293, "cumYoy": 43.29, "note": "因先進製程產品需求增加所致。" } ] } }
```
- `revenue`、`cumRevenue` 單位：**千元**（用 `fmt.revenueYi()` 轉成億）。
- `mom` 月增率、`yoy` 年增率、`cumYoy` 累計年增率（%）。`note` 公司說明（可能為空字串）。
