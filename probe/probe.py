import urllib.request, re, json, gzip
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language": "zh-TW,zh;q=0.9"}
def get(url, accept="text/html", extra={}):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={**UA,"Accept":accept, **extra}), timeout=30)
    b = r.read()
    if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
t = get("https://www.lativ.com.tw/home/MEN")
seen=set(); queue=list(dict.fromkeys(re.findall(r'(chunk-[A-Z0-9]+\.js|main-[A-Z0-9]+\.js)', t)))
hits=[]
while queue:
    c=queue.pop(0)
    if c in seen: continue
    seen.add(c)
    try: js=get("https://www.lativ.com.tw/"+c,"*/*")
    except Exception: continue
    for n in re.findall(r'chunk-[A-Z0-9]+\.js', js):
        if n not in seen: queue.append(n)
    for kw in ["shopwindow", "onsale", "smallCategor", "productId", "lativHttp.get(", "http.get(", "materials", "composition", "Composition"]:
        for m in list(re.finditer(re.escape(kw), js))[:6]:
            hits.append(f"[{c}][{kw}] " + js[max(0,m.start()-160):m.end()+160].replace("\n"," "))
print("CHUNKS", len(seen))
print("\n".join(hits))
