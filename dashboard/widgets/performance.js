const modes = { cumulative: '累積報酬', daily: '每日漲跌' };
const periods = [[5, '5 日'], [22, '1 個月'], [66, '3 個月'], [0, '6 個月']];
let mode = 'cumulative';
let period = 22;

function buttons(options, key, selected, label) {
    return `<div class="seg" role="group" aria-label="${label}">
        ${options.map(([value, text]) => `<button type="button" data-${key}="${value}"
            class="${value === selected ? 'active' : ''}" aria-pressed="${value === selected}">${text}</button>`).join('')}
        </div>`;
}

export default {
    title: '走勢與報酬',
    data: ['prices.json'],

    render(el, ctx) {
        const { data, stocks, color, fmt, charts, setSubtitle } = ctx;
        const prices = data['prices.json']?.symbols;
        const entries = stocks.map(stock => ({
            ...stock,
            byDate: new Map((prices?.[stock.symbol]?.rows ?? [])
                .filter(row => row?.date).map(row => [row.date, row]))
        }));
        const dates = [...new Set(entries.flatMap(({ byDate }) => [...byDate.keys()]))]
            .sort().slice(period ? -period : 0);
        setSubtitle(dates.length ? `${fmt.md(dates[0])}–${fmt.md(dates.at(-1))}` : '');

        const results = entries.map(({ symbol, name, byDate }) => {
            const rows = dates.map(date => byDate.get(date));
            const closes = rows.map(row => row?.close ?? null);
            const base = closes.find(close => Number.isFinite(close) && close > 0);
            const cumulative = closes.map(close => base && Number.isFinite(close)
                ? (close / base - 1) * 100 : null);
            return {
                label: name,
                name,
                color: color(symbol),
                value: cumulative.findLast(value => value != null) ?? null,
                values: mode === 'daily' ? rows.map(row => row?.pct ?? null) : cumulative
            };
        });

        el.innerHTML = `<div class="toolbar">
            ${buttons(Object.entries(modes), 'mode', mode, '圖表')}
            ${buttons(periods, 'period', period, '期間')}</div>
            <div class="perf-chart"></div><p class="muted">期間報酬排行</p><div class="perf-rank"></div>`;

        const chart = el.querySelector('.perf-chart');
        if (results.some(item => item.values.some(value => value != null))) {
            chart.insertAdjacentHTML('beforebegin', `<div class="legend">${results.map(item =>
                `<span><i style="--c:${item.color}"></i>${fmt.esc(item.name)}</span>`).join('')}</div>`);
            charts.lineChart(chart, { labels: dates.map(fmt.md), series: results, yFormat: fmt.pct });
        } else {
            chart.innerHTML = '<p class="placeholder">無股價資料</p>';
        }
        const rank = el.querySelector('.perf-rank');
        if (results.length) {
            charts.hbars(rank, {
                items: [...results].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
                signed: true, format: fmt.pct
            });
        } else {
            rank.textContent = '—';
        }

        for (const key of ['mode', 'period']) {
            el.querySelectorAll(`[data-${key}]`).forEach(button => button.addEventListener('click', () => {
                const value = button.dataset[key];
                if (key === 'mode') mode = value;
                else period = Number(value);
                this.render(el, ctx);
                el.querySelector(`[data-${key}="${value}"]`).focus();
            }));
        }
    }
};
