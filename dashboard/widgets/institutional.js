const institutions = [
    ['foreign', '外資', 'var(--foreign)'],
    ['trust', '投信', 'var(--trust)'],
    ['dealer', '自營商', 'var(--dealer)']
];
let period = 5;
let selectedSymbol;

function sum(rows, key) {
    const values = rows.map(row => row?.[key]).filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function streak(rows) {
    const latest = rows.at(-1)?.total;
    if (!Number.isFinite(latest) || latest === 0) return '—';
    const sign = Math.sign(latest);
    let count = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
        if (Math.sign(rows[i]?.total) !== sign) break;
        count++;
    }
    return `連${sign > 0 ? '買' : '賣'} ${count}`;
}

export default {
    title: '三大法人買賣超',
    data: ['institutional.json'],

    render(el, ctx) {
        const { data, stocks, color, fmt, charts, setSubtitle } = ctx;
        const report = data['institutional.json'];
        const dates = report?.dates ?? [];
        const windowDates = dates.slice(-period);
        setSubtitle(fmt.md(dates.at(-1)));
        if (!stocks.length) {
            el.innerHTML = '<p class="placeholder">請選擇股票</p>';
            return;
        }
        if (!stocks.some(stock => stock.symbol === selectedSymbol)) selectedSymbol = stocks[0].symbol;

        const rows = stocks.map(stock => {
            const byDate = new Map((report?.items?.[stock.symbol] ?? [])
                .filter(row => row?.date).map(row => [row.date, row]));
            const history = dates.map(date => byDate.get(date));
            const recent = history.slice(-period);
            return {
                ...stock, recent, streak: streak(history), total: sum(recent, 'total'),
                amounts: institutions.map(([key]) => sum(recent, key))
            };
        }).sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));

        const amountCell = value => `<td class="${fmt.dir(value)}">${fmt.signed(value)}</td>`;
        const selected = rows.find(row => row.symbol === selectedSymbol);
        el.innerHTML = `<style>
            .inst-row { cursor: pointer; }
            .inst-row.inst-selected { background: var(--surface-2); }
            .inst-stock { background: transparent; border: 0; color: var(--text); padding: 0; }
            .inst-selected .inst-stock { font-weight: 700; }
            </style>
            <div class="toolbar"><div class="seg" role="group" aria-label="期間">
                ${[5, 20].map(days => `<button type="button" data-period="${days}"
                    class="${days === period ? 'active' : ''}" aria-pressed="${days === period}">${days} 日</button>`).join('')}
            </div><div class="legend">${institutions.map(([, label, ink]) =>
                `<span><i style="--c:${ink}"></i>${label}</span>`).join('')}<span>單位：張</span></div></div>
            <div class="table-scroll"><table class="data">
            <thead><tr><th>股票</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th><th>連續</th></tr></thead>
            <tbody>${rows.map(row => `<tr class="inst-row ${row === selected ? 'inst-selected' : ''}">
                <td><button type="button" class="inst-stock name-dot" style="--c:${color(row.symbol)}"
                    aria-pressed="${row === selected}">${fmt.esc(row.name)}</button></td>
                ${row.amounts.map(amountCell).join('')}${amountCell(row.total)}<td>${row.streak}</td>
            </tr>`).join('')}</tbody></table></div>
            <p class="muted">${fmt.esc(selected.name)}｜逐日買賣超（張）</p><div class="inst-chart"></div>`;

        const chart = el.querySelector('.inst-chart');
        const series = institutions.map(([key, name, ink]) => ({
            name, color: ink, values: selected.recent.map(row => row?.[key] ?? null)
        }));
        if (series.some(item => item.values.some(Number.isFinite))) {
            charts.barChart(chart, {
                labels: windowDates.map(fmt.md), series, stacked: true, yFormat: fmt.lots
            });
        } else {
            chart.innerHTML = '<p class="placeholder">無逐日買賣超資料</p>';
        }

        el.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
            period = Number(button.dataset.period);
            this.render(el, ctx);
            el.querySelector(`[data-period="${period}"]`).focus();
        }));
        el.querySelectorAll('.inst-row').forEach((row, index) => row.addEventListener('click', event => {
            selectedSymbol = rows[index].symbol;
            this.render(el, ctx);
            if (event.target.matches('button')) el.querySelectorAll('.inst-stock')[index].focus();
        }));
    }
};
