const balances = [
    ['marginBalance', '融資餘額', 'var(--up)'],
    ['shortBalance', '融券餘額', 'var(--down)']
];
let period = 5;
let selectedSymbol;

function sum(rows, key) {
    const values = rows.map(row => row?.[key]).filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function ratio(row) {
    return row?.marginBalance > 0 && Number.isFinite(row.shortBalance)
        ? row.shortBalance / row.marginBalance * 100 : null;
}

export default {
    title: '融資融券',
    data: ['margin.json'],

    render(el, ctx) {
        const { data, stocks, color, fmt, charts, setSubtitle } = ctx;
        const report = data['margin.json'];
        const dates = report?.dates?.slice(-period) ?? [];
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
            return { ...stock, history, latest: history.at(-1) };
        });
        const selected = rows.find(row => row.symbol === selectedSymbol);
        const changeCell = value => `<td class="${fmt.dir(value)}">${fmt.signed(value)}</td>`;

        el.innerHTML = `<style>
            .mar-row { cursor: pointer; }
            .mar-row.mar-selected { background: var(--surface-2); }
            .mar-stock { background: transparent; border: 0; color: var(--text); padding: 0; }
            .mar-selected .mar-stock { font-weight: 700; }
            </style>
            <div class="toolbar"><div class="seg" role="group" aria-label="期間">
                ${[5, 20].map(days => `<button type="button" data-period="${days}"
                    class="${days === period ? 'active' : ''}" aria-pressed="${days === period}">${days} 日</button>`).join('')}
            </div><span class="muted">單位：張</span></div>
            <div class="table-scroll"><table class="data">
            <thead><tr><th>股票</th><th>融資餘額</th><th>期間融資增減</th><th>融券餘額</th><th>期間融券增減</th><th>券資比</th></tr></thead>
            <tbody>${rows.map(row => `<tr class="mar-row ${row === selected ? 'mar-selected' : ''}">
                <td><button type="button" class="mar-stock name-dot" style="--c:${color(row.symbol)}"
                    aria-pressed="${row === selected}">${fmt.esc(row.name)}</button></td>
                <td>${fmt.num(row.latest?.marginBalance, 0)}</td>${changeCell(sum(row.history, 'marginChange'))}
                <td>${fmt.num(row.latest?.shortBalance, 0)}</td>${changeCell(sum(row.history, 'shortChange'))}
                <td>${fmt.pct(ratio(row.latest)).replace(/^\+/, '')}</td>
            </tr>`).join('')}</tbody></table></div>
            <p class="muted">融資增加、融券減少，通常反映散戶籌碼偏多。</p>
            <p class="muted">${fmt.esc(selected.name)}｜餘額走勢（張）</p><div class="mar-charts"></div>`;

        const series = balances.map(([key, name, ink]) => ({
            name, color: ink, values: selected.history.map(row => row?.[key] ?? null)
        }));
        const chartArea = el.querySelector('.mar-charts');
        const maxima = series.map(item => Math.max(0, ...item.values.filter(Number.isFinite)));
        const bothAvailable = series.every(item => item.values.some(Number.isFinite));
        const split = bothAvailable && Math.max(...maxima) > 20 * Math.min(...maxima);

        if (series.some(item => item.values.some(Number.isFinite))) {
            for (const group of split ? series.map(item => [item]) : [series]) {
                const legend = document.createElement('div');
                legend.className = 'legend';
                legend.innerHTML = group.map(item =>
                    `<span><i style="--c:${item.color}"></i>${item.name}</span>`).join('');
                const chart = document.createElement('div');
                chartArea.append(legend, chart);
                charts.lineChart(chart, {
                    labels: dates.map(fmt.md), series: group, height: split ? 145 : 240,
                    yFormat: fmt.lots
                });
            }
        } else {
            chartArea.innerHTML = '<p class="placeholder">無融資融券走勢資料</p>';
        }

        el.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
            period = Number(button.dataset.period);
            this.render(el, ctx);
            el.querySelector(`[data-period="${period}"]`).focus();
        }));
        el.querySelectorAll('.mar-row').forEach((row, index) => row.addEventListener('click', event => {
            selectedSymbol = rows[index].symbol;
            this.render(el, ctx);
            if (event.target.matches('button')) el.querySelectorAll('.mar-stock')[index].focus();
        }));
    }
};
