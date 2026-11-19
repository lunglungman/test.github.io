// 共用圖表（純 SVG / HTML，不需外部套件）。支援深淺色、滑鼠與手指查看數值、視窗縮放重畫。
//
//   lineChart(el, { labels, series, yFormat, height })
//   barChart(el,  { labels, series, stacked, yFormat, height })
//   hbars(el,     { items: [{ label, value, color, note }], format, signed })
//
// labels：x 軸文字陣列；series：[{ name, color, values: [數字或 null] }]。
// 顏色請用 ctx.color(symbol) 或 CSS 變數字串（例如 'var(--up)'）。

import { esc } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const redraw = new WeakMap();
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => document.querySelectorAll('.chart-host').forEach(el => redraw.get(el)?.()), 150);
});

function niceRange(values, includeZero = true) {
    const v = values.filter(x => x != null && !Number.isNaN(x));
    let lo = Math.min(...(includeZero ? [0] : []), ...v), hi = Math.max(...(includeZero ? [0] : []), ...v);
    if (!v.length) { lo = -1; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const raw = (hi - lo) / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

function frame(el, height) {
    el.classList.add('chart-host');
    el.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('chart-svg');
    svg.style.height = `${height}px`;
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    el.append(svg, tip);
    const W = el.clientWidth || 600;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    return { svg, tip, W, H: height };
}

function axes({ W, H, pad, lo, hi, step, y, labels, x, yFormat }) {
    let s = '';
    for (let v = lo; v <= hi + step / 1e6; v += step) {
        const vv = Math.abs(v) < step / 1e6 ? 0 : v;
        s += `<line class="grid ${vv === 0 ? 'zero' : ''}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(vv)}" y2="${y(vv)}"/>`;
        s += `<text class="tick" x="${pad.l - 6}" y="${y(vv) + 4}" text-anchor="end">${esc(yFormat(vv))}</text>`;
    }
    const n = labels.length;
    const maxTicks = W < 500 ? 4 : 7;
    const every = Math.max(1, Math.ceil(n / maxTicks));
    labels.forEach((lb, i) => {
        if (i % every && i !== n - 1) return;
        if (i !== n - 1 && n - 1 - i < every / 2) return;
        s += `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`;
    });
    return s;
}

function attachTip({ svg, tip, W, pad, n, x, labels, rows, guideTop, guideBottom }) {
    const g = document.createElementNS(NS, 'g');
    g.innerHTML = `<line class="guide" y1="${guideTop}" y2="${guideBottom}" visibility="hidden"/><rect x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="100%" fill="transparent"/>`;
    svg.append(g);
    const guide = g.querySelector('line'), hit = g.querySelector('rect');
    const show = clientX => {
        const box = svg.getBoundingClientRect();
        const px = (clientX - box.left) * (W / box.width);
        let i = 0, best = Infinity;
        for (let k = 0; k < n; k++) { const d = Math.abs(x(k) - px); if (d < best) { best = d; i = k; } }
        guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('visibility', 'visible');
        tip.innerHTML = `<b>${esc(labels[i])}</b>` + rows(i).map(r =>
            `<div><span><i style="background:${r.color}"></i>${esc(r.name)}</span><span class="${r.cls || ''}">${esc(r.text)}</span></div>`).join('');
        tip.hidden = false;
        const tw = tip.offsetWidth, gx = x(i) * (box.width / W);
        tip.style.left = `${gx + 12 + tw > box.width ? gx - 12 - tw : gx + 12}px`;
    };
    const hide = () => { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); };
    hit.addEventListener('mousemove', e => show(e.clientX));
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', e => show(e.touches[0].clientX), { passive: true });
    hit.addEventListener('touchmove', e => show(e.touches[0].clientX), { passive: true });
}

const signCls = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

/** 折線圖 */
export function lineChart(el, opts) {
    const draw = () => {
        const { labels, series, yFormat = v => String(v), height = 280, dotsBelow = 12 } = opts;
        const { svg, tip, W, H } = frame(el, height);
        const pad = { l: 48, r: 12, t: 10, b: 24 };
        const { lo, hi, step } = niceRange(series.flatMap(s => s.values));
        const n = labels.length;
        const inset = n <= dotsBelow ? 16 : 0;
        const x = i => pad.l + inset + (n > 1 ? i / (n - 1) : 0.5) * (W - pad.l - pad.r - inset * 2);
        const y = v => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
        let body = axes({ W, H, pad, lo, hi, step, y, labels, x, yFormat });
        for (const s of series) {
            const pts = s.values.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
            body += `<polyline class="line" points="${pts}" style="stroke:${s.color}"/>`;
            if (n <= dotsBelow) body += s.values.map((v, i) => (v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color}"/>`)).join('');
        }
        svg.innerHTML = body;
        attachTip({
            svg, tip, W, pad, n, x, labels, guideTop: pad.t, guideBottom: H - pad.b,
            rows: i => series.filter(s => s.values[i] != null).sort((a, b) => b.values[i] - a.values[i])
                .map(s => ({ name: s.name, color: s.color, text: yFormat(s.values[i]), cls: signCls(s.values[i]) }))
        });
    };
    redraw.set(el, draw);
    draw();
}

/** 長條圖（可正可負；多個 series 會並排，stacked: true 則堆疊） */
export function barChart(el, opts) {
    const draw = () => {
        const { labels, series, stacked = false, yFormat = v => String(v), height = 260 } = opts;
        const { svg, tip, W, H } = frame(el, height);
        const pad = { l: 56, r: 12, t: 10, b: 24 };
        const n = labels.length;
        const sums = stacked
            ? labels.flatMap((_, i) => {
                const pos = series.reduce((t, s) => t + Math.max(0, s.values[i] || 0), 0);
                const neg = series.reduce((t, s) => t + Math.min(0, s.values[i] || 0), 0);
                return [pos, neg];
            })
            : series.flatMap(s => s.values);
        const { lo, hi, step } = niceRange(sums);
        const band = (W - pad.l - pad.r) / n;
        const x = i => pad.l + band * (i + 0.5);
        const y = v => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
        let body = axes({ W, H, pad, lo, hi, step, y, labels, x, yFormat });
        const bw = Math.max(2, Math.min(28, band * 0.7 / (stacked ? 1 : series.length)));
        labels.forEach((_, i) => {
            let up = 0, down = 0;
            series.forEach((s, k) => {
                const v = s.values[i];
                if (v == null) return;
                let x0, top, bottom;
                if (stacked) {
                    x0 = x(i) - bw / 2;
                    if (v >= 0) { top = y(up + v); bottom = y(up); up += v; } else { top = y(down); bottom = y(down + v); down += v; }
                } else {
                    x0 = x(i) - (bw * series.length) / 2 + k * bw;
                    top = y(Math.max(0, v)); bottom = y(Math.min(0, v));
                }
                body += `<rect class="bar" x="${x0.toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(1, bottom - top).toFixed(1)}" fill="${s.color}"/>`;
            });
        });
        svg.innerHTML = body;
        attachTip({
            svg, tip, W, pad, n, x, labels, guideTop: pad.t, guideBottom: H - pad.b,
            rows: i => series.filter(s => s.values[i] != null).map(s => ({ name: s.name, color: s.color, text: yFormat(s.values[i]), cls: signCls(s.values[i]) }))
        });
    };
    redraw.set(el, draw);
    draw();
}

/** 水平長條（適合比較多檔股票的單一數值）。signed: true 時正值往右、負值往左 */
export function hbars(el, { items, format = v => String(v), signed = false }) {
    const vals = items.map(it => it.value).filter(v => v != null);
    const max = Math.max(1e-9, ...vals.map(Math.abs));
    el.classList.add('hbars');
    el.innerHTML = items.map(it => {
        const w = it.value == null ? 0 : Math.abs(it.value) / max * (signed ? 50 : 100);
        const left = signed ? (it.value < 0 ? 50 - w : 50) : 0;
        return `<div class="hbar-row">
            <span class="hbar-label">${esc(it.label)}</span>
            <span class="hbar-track ${signed ? 'signed' : ''}"><i style="left:${left}%;width:${w}%;background:${it.color || 'var(--primary)'}"></i></span>
            <span class="hbar-value ${signed ? signCls(it.value) : ''}">${esc(it.value == null ? '—' : format(it.value))}</span>
        </div>`;
    }).join('');
}
