import json, re, collections, urllib.request
d = json.load(open("lativ/data.json")); c = json.load(open("lativ/materials.json"))
print("SCANNED", d["scanned"], "COUNT", d["count"])
print("MATERIALS", collections.Counter(v["material"] for v in c.values()).most_common(40))
for p in d["products"][:5]: print("PROD", json.dumps(p, ensure_ascii=False)[:500])
print("BYCAT", collections.Counter(p["category"] for p in d["products"]))
H={"User-Agent":"Mozilla/5.0"}
for u in [d["products"][0]["image"] if d["products"] else "", "https://www.lativ.com.tw/product/"+(d["products"][0]["id"] if d["products"] else "1")]:
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=20); b=r.read()
        print("CHECK", u, r.status, r.headers.get("Content-Type"), len(b), re.search(rb"<title>(.*?)</title>", b).group(1).decode() if b[:20].lstrip().startswith(b"<") and b"<title>" in b else "")
    except Exception as e: print("CHECK", u, e)
t=urllib.request.urlopen(urllib.request.Request("https://www.lativ.com.tw/",headers=H)).read().decode()
for ch in set(re.findall(r'chunk-[A-Z0-9]+\.js', t)):
    js=urllib.request.urlopen(urllib.request.Request("https://www.lativ.com.tw/"+ch,headers=H)).read().decode("utf-8","replace")
    m=re.search(r'\.CART="cart"', js)
    if m: print("ENUM", js[max(0,m.start()-1500):m.end()+800])
