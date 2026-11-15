import urllib.request, re, json, gzip
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language": "zh-TW,zh;q=0.9"}
def get(url):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30)
    b = r.read()
    if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
t = get("https://www.lativ.com.tw/home/MEN")
st = json.loads(re.search(r'<script id="ng-state" type="application/json">(.*?)</script>', t, re.S).group(1))
for v in st.values():
    if isinstance(v, dict) and "bigCategories" in json.dumps(v)[:200]:
        for b in v["body"]["bigCategories"]:
            if b["nameEn"] == "MEN":
                for m in b["mediumCategories"]:
                    print("MED", m["name"], m["nameEn"], [(s["name"], s["nameEn"], s["hash"]) for s in m["smallCategories"]])
                print("BIGKEYS", list(b.keys()))
seen=set(); chunks=re.findall(r'(chunk-[A-Z0-9]+\.js|main-[A-Z0-9]+\.js)', t)
queue=list(dict.fromkeys(chunks)); allpaths=set(); apis=set()
while queue and len(seen)<80:
    c=queue.pop(0)
    if c in seen: continue
    seen.add(c)
    try: js=get("https://www.lativ.com.tw/"+c)
    except Exception as e: print("ERR",c,e); continue
    for n in re.findall(r'chunk-[A-Z0-9]+\.js', js):
        if n not in seen: queue.append(n)
    apis.update(re.findall(r'["\'`]((?:/|\$\{[^}]{1,40}\}/)?v\d/[A-Za-z_\-/{}$.?=&]{2,80})', js))
    allpaths.update(re.findall(r'path:"([^"]*)"', js))
    for kw in ["environment", "apiUrl", "baseUrl", "gateway", "material", "Material"]:
        for mm in list(re.finditer(kw, js))[:2]:
            print(f"JS[{c}][{kw}]", js[max(0,mm.start()-150):mm.end()+200].replace("\n"," "))
print("CHUNKS", len(seen))
print("APIS"); print("\n".join(sorted(apis)))
print("PATHS", sorted(allpaths))
