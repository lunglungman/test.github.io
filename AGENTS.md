# AGENTS.md — 給 AI 協作者（Codex 等）的專案規則

這是 lunglungman 的個人工具網站，用 GitHub Pages 發布：<https://lunglungman.github.io/test.github.io/>
專案由 Claude 主導規畫與審查；任務以 GitHub Issue 發包，請照 issue 的規格與驗收標準完成，並開 PR。

## 網站結構

| 路徑 | 內容 | 負責 |
|---|---|---|
| `/index.html` | 入口首頁（工具卡片） | Claude |
| `/dashboard/` | **股票儀表板**（目前的協作專案，見 `docs/dashboard/PLAN.md`） | Claude 主導，模組可發包 |
| `/stocks/` | 台股即時盯盤（透過 Cloudflare Worker） | Claude |
| `/lativ/` | LATIV 純棉男裝（GitHub Actions 爬蟲） | Claude |
| `/quiz/` | 生物單元測驗 | Claude |
| `/tcm/` | 經方辨證篩選器 | 另一個工作階段 |
| `scripts/`、`.github/workflows/` | 資料抓取程式與排程 | Claude |

## 必須遵守

1. **只改 issue 指定的檔案**。不要動其他工具、資料管線、排程、`dashboard/core.js`、`dashboard/lib/*`、`dashboard/styles.css`，除非 issue 明確要求。需要共用元件的改動，請在 PR 說明裡提出，由 Claude 決定。
2. **不加任何外部套件、CDN、建置工具**。純 HTML / CSS / 原生 JavaScript（ES modules）。圖表請用 `dashboard/lib/charts.js`。
3. **不要放任何金鑰、密碼、憑證**，也不要新增需要金鑰的資料來源。
4. **不要修改 `dashboard/data/*.json`**，那是排程自動產生的。開發時直接讀取它們（就是真實資料）。資料格式見 `docs/dashboard/DATA.md`。
5. **介面文字用繁體中文**。台股慣例：**紅漲綠跌**，請用 `fmt.dir()` 回傳的 `up` / `down` / `flat` class，不要寫死顏色。
6. 顏色一律用 CSS 變數（`var(--up)`、`ctx.color(symbol)`、`var(--foreign)` 等），要同時在**淺色與深色模式**下好讀。
7. 手機（寬 375px）不能出現整頁橫向捲動；寬表格請包在 `<div class="table-scroll">` 裡。
8. 資料可能缺漏（`null`、某檔沒資料、陣列為空），模組必須正常顯示「—」或提示，不能拋錯。
9. PR 標題用繁中，說明寫：做了什麼、怎麼測試、截圖（桌機＋手機）。一個 issue 一個 PR。

## 本機測試

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000/dashboard/
```

檢查清單：瀏覽器主控台沒有錯誤；股票篩選（全部／主要／觀察／單檔）切換後模組正確重畫；深色模式可讀；手機寬度不破版。
