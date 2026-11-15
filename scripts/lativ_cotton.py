#!/usr/bin/env python3
"""抓取 LATIV 男裝中材質為 100% 棉的商品，輸出到 lativ/data.json。

由 GitHub Actions 定時執行。商品材質會快取在 lativ/materials.json，
已知材質的商品不會重複抓詳細頁，以減少對 LATIV 的請求。
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BIG = os.environ.get("LATIV_BIG", "MEN")
SIZE = os.environ.get("LATIV_SIZE", "M")  # 只保留這個尺寸有庫存的商品
BASE = "https://www.lativ.com.tw/"
IMG = "https://cdx.lativ.com.tw/upload-v1/"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lativ")
DATA_FILE = os.path.join(OUT_DIR, "data.json")
CACHE_FILE = os.path.join(OUT_DIR, "materials.json")
DELAY = 0.4  # 每次請求間隔（秒），避免造成對方負擔
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Accept-Language": "zh-TW,zh;q=0.9",
    "Grpc-Metadata-lativ-store-app-platform": "1",
}


def api(path, retries=3):
    url = BASE + path
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                print(f"  ! {e.code} {path}: {e.read()[:200]!r}", file=sys.stderr)
                return None
            err = e
        except Exception as e:  # 網路錯誤：稍後重試
            err = e
        time.sleep(2 * (attempt + 1))
    print(f"  ! 放棄 {path}: {err}", file=sys.stderr)
    return None


def collect_items(node, trail, found):
    """遞迴走訪分類內容，收集所有商品與其所在的小分類名稱。"""
    if isinstance(node, dict):
        meta = node.get("meta")
        if isinstance(meta, dict) and meta.get("productId"):
            pid = str(meta["productId"])
            if pid not in found:
                found[pid] = {"item": node, "trail": list(trail)}
            return
        name = node.get("name")
        new_trail = trail + [name] if isinstance(name, str) and name else trail
        for v in node.values():
            collect_items(v, new_trail, found)
    elif isinstance(node, list):
        for v in node:
            collect_items(v, trail, found)


FIBER_RE = re.compile(r"([^\d\s:：,，、;；/%()（）\n]+?)\s*(\d+(?:\.\d+)?)\s*%")
FIBER_RE_REV = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*([^\d\s:：,，、;；/%()（）\n]+)")


def is_pure_cotton(material):
    """材質中每個部位都是 100% 棉才算（例：「棉 100%」、「表布：棉100% 裡布：棉100%」）。"""
    if not material:
        return False
    text = material.replace("％", "%")
    parts = FIBER_RE.findall(text)
    if not parts:
        parts = [(f, p) for p, f in FIBER_RE_REV.findall(text)]
    if not parts:
        return False
    for fiber, pct in parts:
        fiber = re.sub(r"^.*[：:]", "", fiber).strip()
        if "棉" not in fiber or float(pct) != 100:
            return False
    return True


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def main():
    cats = api("v1/categories?preview=false")
    if not cats:
        sys.exit("無法取得分類列表")
    big = next((b for b in cats.get("bigCategories", []) if b.get("nameEn") == BIG), None)
    if not big:
        sys.exit(f"找不到大分類 {BIG}")

    found = {}
    for med in big.get("mediumCategories", []):
        time.sleep(DELAY)
        content = api(f"v1/categories/{BIG}/{med['nameEn']}/content")
        before = len(found)
        if content:
            collect_items(content.get("contents", content), [med["name"]], found)
        print(f"{med['name']} ({med['nameEn']}): +{len(found) - before}")
    print(f"共 {len(found)} 件商品")
    if not found:
        sys.exit("沒有抓到任何商品，保留舊資料")

    cache = load_json(CACHE_FILE, {})
    fetched = 0
    for pid in found:
        if pid in cache:
            continue
        time.sleep(DELAY)
        detail = api(f"v1/products/{pid}")
        if detail is None:
            continue
        cache[pid] = {"material": (detail.get("material") or "").strip(), "origin": detail.get("origin") or ""}
        fetched += 1
    print(f"新抓詳細頁 {fetched} 件，快取共 {len(cache)} 件")

    products = []
    for pid, entry in found.items():
        info = cache.get(pid)
        if not info or not is_pure_cotton(info["material"]):
            continue
        item, trail = entry["item"], entry["trail"]
        meta = item["meta"]
        # 只保留 M 號有庫存的顏色；沒有任何顏色有 M 號就略過這件商品
        colors = [c for c in (item.get("colors") or [])
                  if any(s.get("name") == SIZE and (s.get("num") or 0) > 0 for s in c.get("sizes") or [])]
        if not colors:
            continue
        price = meta.get("promotionPrice") or meta.get("originPrice")
        image = (meta.get("image") or {}).get("hash") or item.get("listHash")
        products.append({
            "id": pid,
            "name": meta.get("name", ""),
            "price": int(price) if str(price).isdigit() else None,
            "originPrice": int(meta["originPrice"]) if str(meta.get("originPrice", "")).isdigit() else None,
            "material": info["material"],
            "origin": info["origin"],
            "category": trail[0] if trail else "",
            "subcategory": trail[1] if len(trail) > 1 else "",
            "image": IMG + image if image else "",
            "colors": [{"name": c["color"]["name"], "thumb": IMG + c["color"]["thumbnail"]}
                       for c in colors if c.get("color", {}).get("thumbnail")],
            "size": SIZE,
            "url": f"{BASE}product/{pid}",
        })

    products.sort(key=lambda p: (p["category"], p["subcategory"], p["name"]))
    data = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "category": big.get("name", BIG),
        "size": SIZE,
        "scanned": len(found),
        "count": len(products),
        "products": products,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f"100% 棉且 {SIZE} 號有貨：{len(products)} / {len(found)}")


if __name__ == "__main__":
    main()
