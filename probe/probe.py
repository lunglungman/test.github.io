import urllib.request, urllib.error, re, json, gzip
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
     "Accept": "application/json", "Content-Type": "application/json", "Grpc-Metadata-lativ-store-app-platform": "1"}
def api(path):
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://www.lativ.com.tw/"+path, headers=H), timeout=30)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
st, d = api("v1/categories/MEN/tops/content"); print("CAT", st)
s = json.dumps(d, ensure_ascii=False); print(len(s)); print(s[:3000])
def walk(o, path="", out=[]):
    if isinstance(o, dict):
        for k,v in o.items(): walk(v, f"{path}.{k}", out)
    elif isinstance(o, list):
        for i,v in enumerate(o[:2]): walk(v, f"{path}[{i}]", out)
    else: out.append(f"{path} = {str(o)[:80]}")
    return out
print("\n".join(walk(d, out=[])[:120]))
pid = re.search(r'"productId":\s*"(\d+)"', s)
pid = pid.group(1) if pid else "74778"
st, p = api(f"v1/products/{pid}"); print("PROD", pid, st)
ps = json.dumps(p, ensure_ascii=False); print(len(ps))
print("\n".join(walk(p, out=[])[:200]))
for kw in ["棉", "材質", "成分"]:
    for m in list(re.finditer(kw, ps))[:5]: print("KW", kw, ps[max(0,m.start()-200):m.end()+150])
