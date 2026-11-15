import urllib.request, re, json, gzip
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language": "zh-TW,zh;q=0.9"}
def get(url, accept="text/html"):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={**UA,"Accept":accept}), timeout=30)
    b = r.read()
    if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
t = get("https://www.lativ.com.tw/home/MEN")
seen=set(); queue=list(dict.fromkeys(re.findall(r'(chunk-[A-Z0-9]+\.js|main-[A-Z0-9]+\.js)', t)))
apis=set(); routes=set()
while queue and len(seen)<120:
    c=queue.pop(0)
    if c in seen: continue
    seen.add(c)
    try: js=get("https://www.lativ.com.tw/"+c,"*/*")
    except Exception as e: continue
    for n in re.findall(r'chunk-[A-Z0-9]+\.js', js):
        if n not in seen: queue.append(n)
    for m in re.finditer(r'v[1-5]/[a-z_]+(?:/[a-zA-Z_${}.()]+){0,4}', js):
        apis.add(js[max(0,m.start()-30):m.end()+40].replace("\n"," "))
    for m in re.finditer(r'["`]/(?:product|category|categories|detail|item|goods|search|list|shopwindow|onsale)[^"`]{0,60}["`]', js):
        routes.add(js[max(0,m.start()-60):m.end()+30].replace("\n"," "))
print("CHUNKS", len(seen))
print("APIS"); print("\n".join(sorted(apis)))
print("ROUTES"); print("\n".join(sorted(routes)))
# try candidate public JSON endpoints
for u in ["https://www.lativ.com.tw/v1/categories?preview=false","https://www.lativ.com.tw/v3/home/mini?category=MEN"]:
    try: s=get(u,"application/json"); print("API", u, len(s), s[:300])
    except Exception as e: print("APIERR", u, e)
