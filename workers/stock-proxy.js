/**
 * 股票報價中繼站（Cloudflare Worker）
 *
 * - 盯盤股：富果行情 API（需在 Worker 設定加密變數 FUGLE_API_KEY）
 * - 其他股票：證交所基本市況報導，一次請求查全部
 * - 結果暫存幾秒，不論多少人在看，向上游的請求數都固定
 * - 上游出錯時回傳上一次的資料，並暫停一段時間再試，避免被封鎖
 *
 * 要修改股票清單：改下面 REALTIME / OTHERS，或在 Worker 設定同名的環境變數（逗號分隔）。
 */

const DEFAULT_REALTIME = ['2330', '2454', '3443', '3653', '2308'];
const DEFAULT_OTHERS = ['2881', '2882', '2412', '2603', '00878', '0050', '2886', '2891'];

const ALLOWED_ORIGINS = ['https://lunglungman.github.io'];

const TTL = {
    realtime: 6,      // 秒：5 檔 × 每分鐘 10 次 = 50 次，低於富果免費額度 60 次
    others: 30,       // 秒：證交所一次請求查全部
    closed: 300,      // 秒：收盤後 5 分鐘更新一次就好
    backoff: 60       // 秒：上游出錯後暫停多久再試
};

const MAX_SYMBOLS = 20;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const cors = {
            'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Vary': 'Origin'
        };
        if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

        const group = url.pathname.replace(/^\/+|\/+$/g, '');
        if (!['realtime', 'others', 'config'].includes(group)) {
            return json({ error: '請使用 /realtime、/others 或 /config' }, 404, cors);
        }

        const realtime = symbols(env.REALTIME, DEFAULT_REALTIME).slice(0, 5);
        const others = symbols(env.OTHERS, DEFAULT_OTHERS).slice(0, MAX_SYMBOLS);
        if (group === 'config') {
            return json({ realtime, others, ttl: TTL, marketOpen: isMarketOpen() }, 200, cors);
        }

        const open = isMarketOpen();
        const ttl = open ? TTL[group] : TTL.closed;
        const cache = caches.default;
        const freshKey = new Request(`https://stock-proxy.cache/${group}/fresh`);
        const staleKey = new Request(`https://stock-proxy.cache/${group}/stale`);
        const backoffKey = new Request(`https://stock-proxy.cache/${group}/backoff`);

        const fresh = await cache.match(freshKey);
        if (fresh) return withCors(fresh, cors);

        // 剛出過錯：先不要打上游，直接給舊資料
        if (await cache.match(backoffKey)) {
            const stale = await cache.match(staleKey);
            if (stale) return withCors(stale, cors, { stale: true });
            return json({ error: '資料來源暫時無法使用，稍後再試' }, 503, cors);
        }

        try {
            const items = group === 'realtime'
                ? await fetchFugle(realtime, env.FUGLE_API_KEY)
                : await fetchTwse(others);
            const body = JSON.stringify({ group, updated: Date.now(), marketOpen: open, ttl, items });
            const headers = { 'Content-Type': 'application/json; charset=utf-8' };
            ctx.waitUntil(cache.put(freshKey, new Response(body, { headers: { ...headers, 'Cache-Control': `max-age=${ttl}` } })));
            ctx.waitUntil(cache.put(staleKey, new Response(body, { headers: { ...headers, 'Cache-Control': 'max-age=86400' } })));
            return new Response(body, { headers: { ...headers, ...cors, 'Cache-Control': 'no-store' } });
        } catch (err) {
            ctx.waitUntil(cache.put(backoffKey, new Response('1', { headers: { 'Cache-Control': `max-age=${TTL.backoff}` } })));
            const stale = await cache.match(staleKey);
            if (stale) return withCors(stale, cors, { stale: true, error: String(err.message || err) });
            return json({ error: String(err.message || err) }, 502, cors);
        }
    }
};

/* ---------- 資料來源 ---------- */

async function fetchFugle(list, key) {
    if (!key) throw new Error('尚未設定 FUGLE_API_KEY');
    const results = await Promise.all(list.map(async symbol => {
        const r = await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${encodeURIComponent(symbol)}`, {
            headers: { 'X-API-KEY': key }
        });
        if (r.status === 429) throw new Error('富果請求太頻繁（429）');
        if (!r.ok) return { symbol, error: `富果 ${r.status}` };
        const q = await r.json();
        const price = q.lastPrice ?? q.closePrice ?? null;
        const ref = q.referencePrice ?? q.previousClose ?? null;
        return {
            symbol: q.symbol,
            name: q.name,
            price,
            change: q.change ?? (price != null && ref != null ? round(price - ref) : null),
            changePercent: q.changePercent ?? (price != null && ref ? round((price - ref) / ref * 100) : null),
            open: q.openPrice ?? null,
            high: q.highPrice ?? null,
            low: q.lowPrice ?? null,
            prevClose: ref,
            volume: q.total?.tradeVolume ?? null,
            time: q.lastUpdated ? Math.floor(q.lastUpdated / 1000) : null,
            bids: (q.bids || []).slice(0, 5),
            asks: (q.asks || []).slice(0, 5),
            limitUp: !!q.isLimitUpPrice,
            limitDown: !!q.isLimitDownPrice,
            trial: !!q.isTrial
        };
    }));
    return results;
}

async function fetchTwse(list) {
    if (!list.length) return [];
    // 不知道是上市還是上櫃，所以兩種都問，證交所只會回傳存在的那一個
    const exCh = list.flatMap(s => [`tse_${s}.tw`, `otc_${s}.tw`]).join('|');
    const r = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${Date.now()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Referer': 'https://mis.twse.com.tw/stock/index.jsp',
            'Accept': 'application/json'
        }
    });
    if (!r.ok) throw new Error(`證交所 ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data.msgArray)) throw new Error(`證交所回應異常：${data.rtmessage || '無資料'}`);
    const bySymbol = new Map(data.msgArray.map(m => [m.c, m]));
    return list.map(symbol => {
        const m = bySymbol.get(symbol);
        if (!m) return { symbol, error: '查無此股票' };
        const num = v => (v == null || v === '-' || v === '' ? null : Number(v));
        const firstOf = v => (typeof v === 'string' ? num(v.split('_')[0]) : null);
        // 沒有新成交時 z 是 "-"，改用最佳買價估計
        const price = num(m.z) ?? firstOf(m.b) ?? num(m.y);
        const prev = num(m.y);
        return {
            symbol,
            name: m.n,
            price,
            change: price != null && prev != null ? round(price - prev) : null,
            changePercent: price != null && prev ? round((price - prev) / prev * 100) : null,
            open: num(m.o),
            high: num(m.h),
            low: num(m.l),
            prevClose: prev,
            volume: num(m.v),
            time: m.tlong ? Number(m.tlong) : null,
            estimated: num(m.z) == null
        };
    });
}

/* ---------- 小工具 ---------- */

function isMarketOpen(now = new Date()) {
    const t = new Date(now.getTime() + 8 * 3600 * 1000); // 台北時間
    const day = t.getUTCDay();
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    return day >= 1 && day <= 5 && mins >= 8 * 60 + 30 && mins <= 13 * 60 + 35;
}

function symbols(envValue, fallback) {
    if (!envValue) return fallback;
    return String(envValue).split(/[\s,，]+/).map(s => s.trim()).filter(s => /^[0-9A-Z]{4,6}$/i.test(s));
}

function round(n) { return Math.round(n * 100) / 100; }

function json(obj, status, cors) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }
    });
}

async function withCors(res, cors, extra) {
    let body = await res.text();
    if (extra) {
        try { body = JSON.stringify({ ...JSON.parse(body), ...extra }); } catch { /* keep body */ }
    }
    return new Response(body, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }
    });
}
