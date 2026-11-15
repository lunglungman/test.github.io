import urllib.request, urllib.error, re, json, gzip
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language": "zh-TW,zh;q=0.9"}
def get(url, accept="text/html", extra={}):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={**UA,"Accept":accept, **extra}), timeout=30)
        st=r.status; b=r.read(); enc=r.headers.get("Content-Encoding")
    except urllib.error.HTTPError as e:
        st=e.code; b=e.read(); enc=e.headers.get("Content-Encoding")
    if enc == "gzip": b = gzip.decompress(b)
    return st, b.decode("utf-8", "replace")
_, t = get("https://www.lativ.com.tw/home/MEN")
seen=set(); queue=list(dict.fromkeys(re.findall(r'(chunk-[A-Z0-9]+\.js|main-[A-Z0-9]+\.js)', t)))
while queue:
    c=queue.pop(0)
    if c in seen: continue
    seen.add(c)
    st, js=get("https://www.lativ.com.tw/"+c,"*/*")
    for n in re.findall(r'chunk-[A-Z0-9]+\.js', js):
        if n not in seen: queue.append(n)
    for kw in ["lativHttpConfig", "endPointUrl", "setHeaders", "X-Lativ", "x-lativ", "getCategoryContent(", "getProduct(", "Be=", "L={toJSON", "toJSON(e){let t={};return e.bigCategoryEn"]:
        for m in list(re.finditer(re.escape(kw), js))[:3]:
            print(f"[{c}][{kw}] " + js[max(0,m.start()-300):m.end()+500].replace("\n"," "))
for u in ["https://www.lativ.com.tw/v1/categories/MEN/tops/content",
          "https://www.lativ.com.tw/v1/categories/MEN/tops/content?preview=false",
          "https://www.lativ.com.tw/api/v1/categories/MEN/tops/content",
          "https://www.lativ.com.tw/v1/products/74778",
          "https://www.lativ.com.tw/v1/home"]:
    for acc in ["application/json", "*/*"]:
        st, s = get(u, acc)
        print("TRY", u, acc, st, s[:400].replace("\n"," "))
