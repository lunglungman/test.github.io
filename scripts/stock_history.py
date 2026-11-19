#!/usr/bin/env python3
"""抓主要盯盤股票的每日收盤與漲跌幅，輸出 stocks/history.json。

資料來源：證交所「個股日成交資訊」（盤後公開資料，免金鑰）。
由 GitHub Actions 每個交易日收盤後執行。已抓過的月份會保留，之後只更新本月與上個月。
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

SYMBOLS = os.environ.get("STOCKS", "2330,2454,3443,3653,2308").split(",")
MONTHS = int(os.environ.get("MONTHS", "6"))   # 第一次抓幾個月
DELAY = 3.5                                     # 證交所建議每次請求間隔數秒，避免被暫時封鎖
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "stocks", "history.json")
URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={ym}01&stockNo={sym}&response=json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
}


def month_list(n):
    today = date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def num(s):
    s = str(s).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def fetch_month(sym, ym):
    req = urllib.request.Request(URL.format(ym=ym, sym=sym), headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read())
            break
        except Exception as e:  # 網路錯誤：等久一點再試
            print(f"  ! {sym} {ym} 第 {attempt + 1} 次失敗：{e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    else:
        return None, []
    if d.get("stat") != "OK":
        print(f"  ! {sym} {ym}：{d.get('stat')}", file=sys.stderr)
        return None, []
    # 標題如「115年11月 2330 台積電           各日成交資訊」
    parts = (d.get("title") or "").split()
    name = parts[2] if len(parts) >= 3 else sym
    fields = d.get("fields", [])
    idx = {f: i for i, f in enumerate(fields)}
    rows = []
    for row in d.get("data", []):
        roc = row[idx["日期"]].split("/")
        day = f"{int(roc[0]) + 1911}-{roc[1]}-{roc[2]}"
        close = num(row[idx["收盤價"]])
        raw = str(row[idx["漲跌價差"]]).replace(",", "").strip()
        ex = raw.startswith("X")            # X 表示除權息，漲跌以參考價計算
        change = num(raw.lstrip("X"))
        if close is None or change is None:
            continue
        ref = close - change
        rows.append({
            "date": day,
            "close": close,
            "change": round(change, 2),
            "pct": round(change / ref * 100, 2) if ref else None,
            **({"ex": True} if ex else {}),
        })
    return name, rows


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {"symbols": {}}

    for sym in SYMBOLS:
        sym = sym.strip()
        entry = data["symbols"].get(sym, {"name": sym, "rows": []})
        months = month_list(2) if entry["rows"] else month_list(MONTHS)
        by_date = {r["date"]: r for r in entry["rows"]}
        for ym in months:
            time.sleep(DELAY)
            name, rows = fetch_month(sym, ym)
            if name:
                entry["name"] = name
            for r in rows:
                by_date[r["date"]] = r
            print(f"{sym} {ym}: {len(rows)} 天")
        # 只保留最近約一年
        entry["rows"] = sorted(by_date.values(), key=lambda r: r["date"])[-260:]
        data["symbols"][sym] = entry

    # 移除已經不在清單裡的股票
    data["symbols"] = {s: data["symbols"][s] for s in [x.strip() for x in SYMBOLS] if s in data["symbols"]}
    if not any(e["rows"] for e in data["symbols"].values()):
        sys.exit("沒有抓到任何資料，保留舊檔")
    data["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data["order"] = [s.strip() for s in SYMBOLS]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print("完成：", {s: len(e["rows"]) for s, e in data["symbols"].items()})


if __name__ == "__main__":
    main()
