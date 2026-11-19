#!/usr/bin/env python3
"""股票儀表板資料管線：從證交所抓盤後資料，輸出 dashboard/data/*.json。

由 .github/workflows/dashboard-data.yml 每個交易日自動執行。
- prices.json        每日股價與漲跌幅（約一年）
- valuation.json     最新本益比、殖利率、股價淨值比
- institutional.json 近 20 個交易日三大法人買賣超（張）
- margin.json        近 20 個交易日融資融券（張）
- revenue.json       每月營收（每月公布後累積）
- meta.json          更新時間與各檔最新日期

資料格式說明見 docs/dashboard/DATA.md。只抓缺少的日期，已抓過的會保留，
每次請求間隔數秒，避免對證交所造成負擔或被暫時封鎖。
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, "dashboard", "data")
WATCHLIST = os.path.join(ROOT, "dashboard", "watchlist.json")
DELAY = 3.5
DAYS = 20          # 法人、融資融券保留幾個交易日
PRICE_MONTHS = 6   # 第一次抓幾個月股價
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
}
TWSE = "https://www.twse.com.tw/rwd/zh"

_last_request = 0.0


def get_json(url):
    """GET 並解析 JSON；間隔 DELAY 秒，失敗重試兩次，最後回傳 None。"""
    global _last_request
    for attempt in range(3):
        wait = DELAY - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f"  ! 第 {attempt + 1} 次失敗 {url}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    return None


def num(s):
    s = str(s).replace(",", "").strip()
    if s in ("", "-", "--", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def lots(shares):
    """股數換算成張（四捨五入）。"""
    v = num(shares)
    return None if v is None else round(v / 1000)


def roc_to_iso(s):
    y, m, d = str(s).strip().split("/")
    return f"{int(y) + 1911}-{m}-{d}"


def load(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(name, obj):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def months_back(n):
    y, m = date.today().year, date.today().month
    out = []
    for _ in range(n):
        out.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


# ---------------------------------------------------------------- 股價

def update_prices(stocks):
    data = load("prices.json", {"symbols": {}})
    for s in stocks:
        sym = s["symbol"]
        entry = data["symbols"].get(sym, {"name": s["name"], "rows": []})
        months = months_back(2) if entry["rows"] else months_back(PRICE_MONTHS)
        by_date = {r["date"]: r for r in entry["rows"]}
        for r in by_date.values():          # 舊資料相容：除權息日的漲跌改為 null
            if r.get("ex"):
                r["change"] = None
                r["pct"] = None
        for ym in months:
            d = get_json(f"{TWSE}/afterTrading/STOCK_DAY?date={ym}01&stockNo={sym}&response=json")
            if not d or d.get("stat") != "OK":
                print(f"  ! 股價 {sym} {ym}: {d and d.get('stat')}", file=sys.stderr)
                continue
            idx = {f: i for i, f in enumerate(d["fields"])}
            for row in d["data"]:
                close = num(row[idx["收盤價"]])
                raw = str(row[idx["漲跌價差"]]).replace(",", "").strip()
                change = num(raw.lstrip("X"))
                if close is None or change is None:
                    continue
                ref = close - change
                r = {
                    "date": roc_to_iso(row[idx["日期"]]),
                    "open": num(row[idx["開盤價"]]),
                    "high": num(row[idx["最高價"]]),
                    "low": num(row[idx["最低價"]]),
                    "close": close,
                    "change": round(change, 2),
                    "pct": round(change / ref * 100, 2) if ref else None,
                    "volume": lots(row[idx["成交股數"]]),
                }
                if raw.startswith("X"):
                    # 除權息日：證交所不提供漲跌（顯示 X0.00），無法得知參考價，漲跌記為 null
                    r["ex"] = True
                    r["change"] = None
                    r["pct"] = None
                by_date[r["date"]] = r
        entry["name"] = s["name"]
        entry["rows"] = sorted(by_date.values(), key=lambda r: r["date"])[-260:]
        data["symbols"][sym] = entry
        print(f"股價 {sym}: {len(entry['rows'])} 天")
    data["symbols"] = {s["symbol"]: data["symbols"][s["symbol"]] for s in stocks if s["symbol"] in data["symbols"]}
    save("prices.json", data)
    return data


def trading_days(prices):
    """以清單第一檔的股價日期當作交易日曆。"""
    for e in prices["symbols"].values():
        if e["rows"]:
            return [r["date"] for r in e["rows"]]
    return []


# ---------------------------------------------------------------- 估值

def update_valuation(stocks, days):
    wanted = {s["symbol"] for s in stocks}
    for day in reversed(days[-5:]):
        d = get_json(f"{TWSE}/afterTrading/BWIBBU_d?date={day.replace('-', '')}&selectType=ALL&response=json")
        if not d or d.get("stat") != "OK":
            continue
        idx = {f: i for i, f in enumerate(d["fields"])}
        items = []
        for row in d["data"]:
            sym = str(row[idx["證券代號"]]).strip()
            if sym not in wanted:
                continue
            items.append({
                "symbol": sym,
                "name": str(row[idx["證券名稱"]]).strip(),
                "close": num(row[idx["收盤價"]]),
                "pe": num(row[idx["本益比"]]),
                "dividendYield": num(row[idx["殖利率(%)"]]),
                "pb": num(row[idx["股價淨值比"]]),
                "dividendYear": row[idx["股利年度"]],
                "reportPeriod": row[idx["財報年/季"]],
            })
        order = [s["symbol"] for s in stocks]
        items.sort(key=lambda x: order.index(x["symbol"]))
        save("valuation.json", {"date": day, "items": items})
        print(f"估值 {day}: {len(items)} 檔")
        return
    print("  ! 估值：最近 5 天都沒有資料", file=sys.stderr)


# ---------------------------------------------------------------- 三大法人

def parse_t86(d, wanted):
    f = d["fields"]
    col = lambda name: f.index(name)
    out = {}
    for row in d["data"]:
        sym = str(row[0]).strip()
        if sym not in wanted:
            continue
        foreign = (lots(row[col("外陸資買賣超股數(不含外資自營商)")]) or 0) + (lots(row[col("外資自營商買賣超股數")]) or 0)
        out[sym] = {
            "foreign": foreign,
            "trust": lots(row[col("投信買賣超股數")]) or 0,
            "dealer": lots(row[col("自營商買賣超股數")]) or 0,
            "total": lots(row[col("三大法人買賣超股數")]) or 0,
        }
    return out


# ---------------------------------------------------------------- 融資融券

def parse_margin(d, wanted):
    table = next((t for t in d.get("tables", []) if t.get("fields") and t["fields"][0] == "代號"), None)
    if not table:
        return {}
    out = {}
    for row in table["data"]:
        sym = str(row[0]).strip()
        if sym not in wanted:
            continue
        # 欄位：代號 名稱 | 融資 買進 賣出 現金償還 前日餘額 今日餘額 限額 | 融券 買進 賣出 現券償還 前日餘額 今日餘額 限額 | 資券互抵 註記
        mb, mprev, mbal = num(row[2]), num(row[5]), num(row[6])
        sprev, sbal = num(row[11]), num(row[12])
        out[sym] = {
            "marginBuy": mb,
            "marginSell": num(row[3]),
            "marginBalance": mbal,
            "marginChange": None if mbal is None or mprev is None else mbal - mprev,
            "shortSell": num(row[9]),
            "shortBalance": sbal,
            "shortChange": None if sbal is None or sprev is None else sbal - sprev,
            "offset": num(row[14]),
        }
    return out


def update_daily_series(name, stocks, days, url_fn, parser):
    """法人、融資融券：逐日抓，只補缺的日期，保留最近 DAYS 個交易日。"""
    wanted = {s["symbol"] for s in stocks}
    data = load(name, {"dates": [], "byDate": {}})
    by_date = data.get("byDate", {})
    target = days[-DAYS:]
    for day in target:
        have = by_date.get(day)
        if have is not None and wanted <= set(have):
            continue
        d = get_json(url_fn(day.replace("-", "")))
        if not d or d.get("stat") != "OK":
            print(f"  ! {name} {day}: {d and d.get('stat')}", file=sys.stderr)
            continue
        by_date[day] = parser(d, wanted)
    by_date = {k: v for k, v in by_date.items() if k in target}
    dates = sorted(by_date)
    items = {s["symbol"]: [{"date": dt, **by_date[dt][s["symbol"]]} for dt in dates if s["symbol"] in by_date[dt]]
             for s in stocks}
    save(name, {"dates": dates, "items": items, "byDate": by_date})
    print(f"{name}: {len(dates)} 天")


# ---------------------------------------------------------------- 月營收

def update_revenue(stocks):
    wanted = {s["symbol"] for s in stocks}
    data = load("revenue.json", {"months": [], "items": {}})
    d = get_json("https://openapi.twse.com.tw/v1/opendata/t187ap05_L")
    if not isinstance(d, list):
        print("  ! 月營收：抓取失敗", file=sys.stderr)
        return
    for row in d:
        sym = str(row.get("公司代號", "")).strip()
        if sym not in wanted:
            continue
        ym = str(row["資料年月"])
        month = f"{int(ym[:-2]) + 1911}-{ym[-2:]}"
        rec = {
            "month": month,
            "revenue": num(row.get("營業收入-當月營收")),           # 單位：千元
            "mom": num(row.get("營業收入-上月比較增減(%)")),
            "yoy": num(row.get("營業收入-去年同月增減(%)")),
            "cumRevenue": num(row.get("累計營業收入-當月累計營收")),
            "cumYoy": num(row.get("累計營業收入-前期比較增減(%)")),
            "note": (row.get("備註") or "").strip() if (row.get("備註") or "").strip() not in ("-", "") else "",
        }
        for k in ("mom", "yoy", "cumYoy"):
            if rec[k] is not None:
                rec[k] = round(rec[k], 2)
        rows = [r for r in data["items"].get(sym, []) if r["month"] != month] + [rec]
        data["items"][sym] = sorted(rows, key=lambda r: r["month"])[-24:]
    data["items"] = {s["symbol"]: data["items"].get(s["symbol"], []) for s in stocks}
    data["months"] = sorted({r["month"] for rows in data["items"].values() for r in rows})
    save("revenue.json", data)
    print(f"月營收: {data['months'][-1:] }")


# ---------------------------------------------------------------- 主程式

def main():
    with open(WATCHLIST, encoding="utf-8") as f:
        stocks = json.load(f)["stocks"][:10]
    only = set(filter(None, os.environ.get("ONLY", "").split(",")))   # 例：ONLY=margin 只更新融資融券

    prices = update_prices(stocks) if not only or "prices" in only else load("prices.json", {"symbols": {}})
    days = trading_days(prices)
    if not days:
        sys.exit("取不到交易日資料，保留舊檔")

    if not only or "valuation" in only:
        update_valuation(stocks, days)
    if not only or "institutional" in only:
        update_daily_series("institutional.json", stocks, days,
                            lambda d: f"{TWSE}/fund/T86?date={d}&selectType=ALLBUT0999&response=json", parse_t86)
    if not only or "margin" in only:
        update_daily_series("margin.json", stocks, days,
                            lambda d: f"{TWSE}/marginTrading/MI_MARGN?date={d}&selectType=ALL&response=json", parse_margin)
    if not only or "revenue" in only:
        update_revenue(stocks)

    latest = {}
    for name in ("valuation.json", "institutional.json", "margin.json", "revenue.json"):
        d = load(name, {})
        latest[name.split(".")[0]] = d.get("date") or (d.get("dates") or d.get("months") or [None])[-1]
    latest["prices"] = days[-1]
    save("meta.json", {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latest": latest,
        "stocks": stocks,
        "source": "臺灣證券交易所盤後資料",
    })
    print("完成", latest)


if __name__ == "__main__":
    main()
