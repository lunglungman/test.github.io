# 股票儀表板 規畫

> 主導：Claude｜協作：Codex（透過 GitHub Issue 發包）｜擁有者：lunglungman

## 目標

一頁看完觀察清單（最多 10 檔）的**盤後**狀況：股價走勢、估值、法人動向、散戶籌碼、營收成長。
**全部自動更新**、**模組化**（每個區塊獨立，可隨時加入或拿掉）。

## 架構

```
證交所盤後資料 ──(GitHub Actions：每交易日 15:47、21:47)──▶ scripts/dashboard/build_data.py
                                                                  │
                                                                  ▼
                                                   dashboard/data/*.json（自動 commit）
                                                                  │
dashboard/index.html ─ core.js ─ 依 layout.js 載入 widgets/*.js ◀─┘（每 10 分鐘檢查新資料）
```

| 檔案 | 用途 | 誰改 |
|---|---|---|
| `dashboard/watchlist.json` | 觀察清單（代號、名稱、群組 main/watch） | 使用者／Claude |
| `scripts/dashboard/build_data.py` | 抓資料 | Claude |
| `dashboard/data/*.json` | 自動產生的資料，**不要手改** | 排程 |
| `dashboard/layout.js` | 區塊清單：順序、寬度；刪掉一行就拿掉區塊 | Claude（合併時） |
| `dashboard/core.js` | 載入資料、股票篩選、排版、自動更新 | Claude |
| `dashboard/lib/format.js` | 數字、百分比、張數、顏色 class | Claude |
| `dashboard/lib/charts.js` | `lineChart`、`barChart`、`hbars` | Claude |
| `dashboard/styles.css` | 共用樣式與 CSS 變數 | Claude |
| `dashboard/widgets/<id>.js` | **各區塊模組** | 依 issue 發包 |

## 模組介面

每個模組是 `dashboard/widgets/<id>.js`，`export default` 一個物件：

```js
export default {
    title: '估值一覽',                  // 區塊標題（也顯示在「版面」選單）
    data: ['valuation.json'],          // 需要的資料檔，core 會先載好
    render(el, ctx) { ... }            // 把內容畫進 el；股票篩選改變時會重新呼叫
};
```

`ctx` 內容：

| 欄位 | 說明 |
|---|---|
| `ctx.data['xxx.json']` | 已載入的資料（格式見 `DATA.md`） |
| `ctx.stocks` | **目前篩選後**要顯示的股票 `[{ symbol, name, group }]`，依清單順序 |
| `ctx.allStocks` | 完整觀察清單 |
| `ctx.color(symbol)` | 該股票的系列色（CSS 變數字串），所有模組同一檔顏色一致 |
| `ctx.fmt` | `lib/format.js`：`num`、`pct`、`signed`、`lots`、`revenueYi`、`dir`、`md`、`ym`、`esc` |
| `ctx.charts` | `lib/charts.js`：`lineChart(el, opts)`、`barChart(el, opts)`、`hbars(el, opts)` |
| `ctx.setSubtitle(text)` | 設定標題旁的小字（例如資料日期） |

規則：
- 只在 `el` 裡面操作 DOM；模組自己的狀態（例如切換天數）存在模組物件或閉包裡，重畫時保留。
- 插入文字一律經過 `fmt.esc()`。
- 模組專屬的 CSS 用 `<style>` 寫在模組裡也可以，但 class 名稱要加模組前綴（例如 `.val-…`），避免撞名。
- 參考範例：`dashboard/widgets/summary.js`。

## 模組清單（第一版）

| id | 標題 | 資料 | 寬度 | Issue | 負責 |
|---|---|---|---|---|---|
| `summary` | 今日總覽 | prices | full | — | Claude（範例） |
| `performance` | 走勢與報酬 | prices | full | W4 | Codex |
| `valuation` | 估值一覽 | valuation, prices | half | W1 | Codex |
| `revenue` | 月營收 | revenue | half | W5 | Codex |
| `institutional` | 三大法人買賣超 | institutional | full | W2 | Codex |
| `margin` | 融資融券 | margin | full | W3 | Codex |

## 協作流程

1. Claude 開 issue（標籤 `dashboard`、`codex`），寫明檔案、需求、驗收標準。
2. Codex 依 issue 實作，只新增／修改 `dashboard/widgets/<id>.js`，開 PR 並附截圖。
3. Claude 審查：本機跑、檢查淺深色與手機、篩選切換；有問題在 PR 留言（`@codex` 請它修正）。
4. 通過後 Claude 合併；GitHub Pages 自動上線。

## 之後可以加的（第二版候選）

- 累積報酬排行、相對大盤（加權指數）表現
- 除權息日曆、股利資訊
- 法人連續買賣超天數提示
- 觀察清單在網頁上直接編輯（目前改 `watchlist.json`）
