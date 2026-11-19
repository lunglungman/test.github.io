// 今日總覽：最新收盤價、漲跌、成交量，以及近 5 日漲跌幅小圖。
// 這是示範模組，其他模組請照這個結構寫（見 docs/dashboard/PLAN.md）。

export default {
    title: '今日總覽',
    data: ['prices.json'],

    render(el, { data, stocks, color, fmt, setSubtitle }) {
        const prices = data['prices.json'];
        const last = sym => prices.symbols[sym]?.rows.slice(-1)[0];
        const lastDate = stocks.map(s => last(s.symbol)?.date).filter(Boolean).sort().pop();
        setSubtitle(lastDate ? `${fmt.md(lastDate)} 收盤` : '');

        el.innerHTML = `<div class="summary-grid">${stocks.map(s => {
            const rows = prices.symbols[s.symbol]?.rows || [];
            const r = rows[rows.length - 1];
            if (!r) return `<div class="sum-card"><b>${fmt.esc(s.name)}</b><span class="muted">無資料</span></div>`;
            const d = fmt.dir(r.pct);
            const spark = rows.slice(-5).map(x => {
                const h = Math.min(100, Math.abs(x.pct ?? 0) * 10);
                return `<i class="${fmt.dir(x.pct)}" style="height:${Math.max(4, h)}%" title="${fmt.md(x.date)} ${fmt.pct(x.pct)}"></i>`;
            }).join('');
            return `<div class="sum-card" style="--c:${color(s.symbol)}">
                <div class="sum-head"><b>${fmt.esc(s.name)}</b><small>${s.symbol}</small></div>
                <div class="sum-price ${d}">${fmt.num(r.close)}</div>
                <div class="sum-chg ${d}">${fmt.signed(r.change, 2)}（${fmt.pct(r.pct)}）</div>
                <div class="sum-foot"><span>量 ${fmt.lots(r.volume)}</span><span class="spark" title="近 5 日漲跌">${spark}</span></div>
            </div>`;
        }).join('')}</div>`;
    }
};
