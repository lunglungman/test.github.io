import json, urllib.request, time
H={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36","Accept":"application/json"}
def get(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=30); return json.loads(r.read())
    except Exception as e: return {"ERR":str(e)}
S=["2330","2317","6669"]
def show(name,u):
    time.sleep(3.5); d=get(u); print("\n=====",name,u)
    if isinstance(d,list):
        print("LIST",len(d)); print(json.dumps([x for x in d if str(x.get("公司代號",x.get("Code",""))) in S][:2] or d[:1],ensure_ascii=False)[:1500]); return
    print({k:(v if not isinstance(v,list) else f"list[{len(v)}]") for k,v in d.items() if k not in("data",)})
    if "fields" in d: print("FIELDS",d["fields"]); print("ROWS",[r for r in d.get("data",[]) if r and str(r[0]).strip() in S][:3])
    for t in d.get("tables",[]) or []:
        print("TABLE",t.get("title"),"FIELDS",t.get("fields"),"GROUPS",t.get("groups")); print("ROWS",[r for r in t.get("data",[]) if r and str(r[0]).strip() in S][:3])
D="20261118"
show("T86","https://www.twse.com.tw/rwd/zh/fund/T86?date=%s&selectType=ALLBUT0999&response=json"%D)
show("MARGN","https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=%s&selectType=ALL&response=json"%D)
show("BWIBBU","https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=%s&selectType=ALL&response=json"%D)
show("REV","https://openapi.twse.com.tw/v1/opendata/t187ap05_L")
show("STOCKDAY","https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261101&stockNo=6669&response=json")
