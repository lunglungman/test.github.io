const metrics = { yoy: '年增率', mom: '月增率', cumYoy: '累計年增率' };
let metric = 'yoy';
let selectedSymbol;

export default {
    title: '月營收',
    data: ['revenue.json'],

    render(el, ctx) {
        const { data, stocks, color, fmt, charts, setSubtitle } = ctx;
        const revenue = data['revenue.json'];
        const month = revenue?.months?.at(-1);
        setSubtitle(fmt.ym(month));
        if (!stocks.length) {
            el.innerHTML = '<p class="placeholder">請選擇股票</p>';
            return;
        }

        const rows = stocks.map(stock => {
            const history = (revenue?.items?.[stock.symbol] ?? [])
                .filter(row => row?.month).sort((a, b) => a.month.localeCompare(b.month));
            return { ...stock, history, latest: history.find(row => row.month === month) };
        });
        const selected = rows.find(row => row.symbol === selectedSymbol) ??
            rows.find(row => row.history.filter(item => Number.isFinite(item.revenue)).length >= 3) ?? rows[0];
        selectedSymbol = selected.symbol;
        const pct = value => `<td class="${fmt.dir(value)}">${fmt.pct(value)}</td>`;

        el.innerHTML = `<style>
            .rev-row { cursor: pointer; }
            .rev-row.rev-selected { background: var(--surface-2); }
            .rev-stock { background: transparent; border: 0; color: var(--text); padding: 0; }
            .rev-selected .rev-stock { font-weight: 700; }
            .rev-note { white-space: pre-line; overflow-wrap: anywhere; }
            </style><div class="toolbar"><div class="seg" role="group" aria-label="營收指標">
            ${Object.entries(metrics).map(([key, label]) => `<button type="button" data-metric="${key}"
                class="${key === metric ? 'active' : ''}" aria-pressed="${key === metric}">${label}</button>`).join('')}
            </div></div><div class="rev-bars"></div>
            <div class="table-scroll" style="margin-top:10px"><table class="data">
            <thead><tr><th>股票</th><th>營收（億）</th><th>月增</th><th>年增</th><th>累計年增</th></tr></thead>
            <tbody>${rows.map(({ symbol, name, latest }) => `<tr class="rev-row ${symbol === selectedSymbol ? 'rev-selected' : ''}"
                ${latest?.note ? `title="${fmt.esc(latest.note)}"` : ''}>
                <td><button type="button" class="rev-stock name-dot" style="--c:${color(symbol)}"
                    aria-pressed="${symbol === selectedSymbol}">${fmt.esc(name)}</button></td>
                <td>${fmt.revenueYi(latest?.revenue)}</td>${pct(latest?.mom)}${pct(latest?.yoy)}${pct(latest?.cumYoy)}
            </tr>`).join('')}</tbody></table></div>
            ${selected.latest?.note ? `<p class="muted rev-note">${fmt.esc(selected.name)}｜${fmt.esc(selected.latest.note)}</p>` : ''}
            <div class="rev-history"></div>`;

        charts.hbars(el.querySelector('.rev-bars'), {
            items: rows.map(({ symbol, name, latest }) => ({
                label: name, value: latest?.[metric] ?? null, color: color(symbol)
            })).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
            signed: true, format: fmt.pct
        });
        const chart = el.querySelector('.rev-history');
        const values = selected.history.map(row => Number.isFinite(row.revenue) ? row.revenue / 1e5 : null);
        const count = values.filter(value => value != null).length;
        if (count >= 3) {
            chart.insertAdjacentHTML('beforebegin', `<p class="muted">${fmt.esc(selected.name)} 月營收（億元）</p>`);
            charts.lineChart(chart, {
                labels: selected.history.map(row => fmt.ym(row.month)),
                series: [{ name: selected.name, color: color(selected.symbol), values }],
                height: 165, yFormat: value => fmt.num(value, 1)
            });
        } else {
            chart.innerHTML = `<p class="muted">歷史資料累積中（目前 ${count} 個月）</p>`;
        }

        el.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
            metric = button.dataset.metric;
            this.render(el, ctx);
            el.querySelector(`[data-metric="${metric}"]`).focus();
        }));
        el.querySelectorAll('.rev-row').forEach((row, index) => row.addEventListener('click', event => {
            selectedSymbol = rows[index].symbol;
            this.render(el, ctx);
            if (event.target.matches('button')) el.querySelectorAll('.rev-stock')[index].focus();
        }));
    }
};
