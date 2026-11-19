const metrics = { pe: '本益比', dividendYield: '殖利率', pb: '股價淨值比' };
let metric = 'pe';

export default {
    title: '估值一覽',
    data: ['valuation.json'],

    render(el, ctx) {
        const { data, stocks, fmt, charts, color, setSubtitle } = ctx;
        const valuation = data['valuation.json'];
        setSubtitle(fmt.md(valuation?.date));
        if (!stocks.length) {
            el.innerHTML = '<p class="placeholder">請選擇股票</p>';
            return;
        }

        const bySymbol = new Map((valuation?.items ?? [])
            .filter(item => item?.symbol).map(item => [item.symbol, item]));
        const rows = stocks.map(stock => ({ ...stock, item: bySymbol.get(stock.symbol) }));
        const yieldPct = value => fmt.pct(value).replace(/^\+/, '');
        const sorted = [...rows].sort((a, b) =>
            (b.item?.[metric] ?? -Infinity) - (a.item?.[metric] ?? -Infinity));

        el.innerHTML = `<div class="toolbar"><div class="seg" role="group" aria-label="估值指標">
            ${Object.entries(metrics).map(([key, label]) => `<button type="button" data-metric="${key}"
                class="${key === metric ? 'active' : ''}" aria-pressed="${key === metric}">${label}</button>`).join('')}
            </div></div><div class="val-bars"></div>
            <div class="table-scroll" style="margin-top:10px"><table class="data">
            <thead><tr><th>股票</th><th>收盤</th><th>本益比</th><th>殖利率</th><th>淨值比</th></tr></thead>
            <tbody>${rows.map(({ symbol, name, item }) => `<tr>
                <td><span class="name-dot" style="--c:${color(symbol)}">${fmt.esc(name)}</span></td>
                <td>${fmt.num(item?.close)}</td><td>${fmt.num(item?.pe)}</td>
                <td>${yieldPct(item?.dividendYield)}</td><td>${fmt.num(item?.pb)}</td>
            </tr>`).join('')}</tbody></table></div>`;

        charts.hbars(el.querySelector('.val-bars'), {
            items: sorted.map(({ symbol, name, item }) => ({
                label: name, value: item?.[metric] ?? null, color: color(symbol)
            })),
            format: metric === 'dividendYield' ? yieldPct : value => fmt.num(value)
        });

        el.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
            metric = button.dataset.metric;
            this.render(el, ctx);
            el.querySelector(`[data-metric="${metric}"]`).focus();
        }));
    }
};
