import urllib.request, re, json, gzip
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9"}
def get(url):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30)
    b = r.read()
    if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
t = get("https://www.lativ.com.tw/home/MEN")
m = re.search(r'<script id="ng-state" type="application/json">(.*?)</script>', t, re.S)
print("NGSTATE", bool(m))
if m:
    st = json.loads(m.group(1))
    for k, v in st.items():
        s = json.dumps(v, ensure_ascii=False)
        url = v.get("u") or v.get("url") if isinstance(v, dict) else None
        print("KEY", k, "URL", url, "LEN", len(s)); print("   ", s[:700])
js = get("https://www.lativ.com.tw/" + re.search(r'src="(main-[^"]+\.js)"', t).group(1))
print("MAINJS", len(js))
for pat in [r'https?://[a-zA-Z0-9.\-]+(?:/[^"\'`\s]{0,60})?', r'["\'`](/?(?:api|v\d)/[^"\'`]{2,80})["\'`]', r'path:"([^"]+)"']:
    print("PAT", pat); print(sorted(set(re.findall(pat, js)))[:120])
for kw in ["material", "Material", "composition", "fabric", "材質", "productDetail", "smallCategory", "category/"]:
    for mm in list(re.finditer(kw, js))[:4]:
        print(f"JS[{kw}]", js[max(0,mm.start()-250):mm.end()+250].replace("\n"," "))
