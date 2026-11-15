import urllib.request, re, sys, json, gzip
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9", "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"}
def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30)
        b = r.read()
        if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
        return r.status, r.geturl(), b.decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", None), url, f"ERR {e}"
def show(url, extra=()):
    st, final, t = get(url)
    print(f"\n===== {url} -> {st} {final} len={len(t)}")
    m = re.search(r"<title>(.*?)</title>", t, re.S); print("TITLE", m and m.group(1).strip())
    print("NEXT_DATA", "__NEXT_DATA__" in t, "NUXT", "__NUXT__" in t)
    hrefs = sorted(set(re.findall(r'href="([^"#]+)"', t)))
    print("HREFS", len(hrefs)); print("\n".join(hrefs[:150]))
    print("SCRIPTS", re.findall(r'<script[^>]+src="([^"]+)"', t)[:30])
    print("APIHINTS", sorted(set(re.findall(r'["\'](/?(?:api|Api|API)[^"\'\s]{0,80})["\']', t)))[:40])
    for kw in ["材質", "棉", "Cotton", "cotton"] + list(extra):
        for m in list(re.finditer(kw, t))[:3]:
            print(f"KW[{kw}]", re.sub(r"\s+", " ", t[max(0,m.start()-200):m.end()+200]))
    return t
home = show("https://www.lativ.com.tw/")
for u in ["https://www.lativ.com.tw/MEN", "https://www.lativ.com.tw/men"]:
    show(u)
# try to find a product link
links = re.findall(r'href="(/(?:Detail|detail|product|Product)[^"]+)"', home)
print("PRODUCT LINKS", links[:10])
if links: show("https://www.lativ.com.tw" + links[0])
