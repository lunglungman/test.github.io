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
consts={}
while queue:
    c=queue.pop(0)
    if c in seen: continue
    seen.add(c)
    st, js=get("https://www.lativ.com.tw/"+c,"*/*")
    for n in re.findall(r'chunk-[A-Z0-9]+\.js', js):
        if n not in seen: queue.append(n)
    m=re.search(r'Grpc-Metadata-lativ-store-api-version', js)
    if m: print("INTERCEPTOR", c, js[m.start()-100:m.end()+1500])
    for mm in re.finditer(r'API_VERSION:"?([^,"}]+)"?|PLATFORM[A-Z_]*:"([^"]+)"', js):
        print("CONST", c, js[max(0,mm.start()-150):mm.end()+150])
