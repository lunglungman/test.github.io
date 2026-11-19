// 儀表板核心：載入資料、股票篩選、依 layout.js 排版並呼叫各模組，定時自動更新。
// 模組介面說明見 docs/dashboard/PLAN.md「模組介面」。

import layout from './layout.js';
import * as fmt from './lib/format.js';
import * as charts from './lib/charts.js';

const REFRESH_MS = 10 * 60 * 1000;   // 每 10 分鐘檢查一次是否有新資料
const PALETTE = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8', '--s9', '--s10'];
const $ = s => document.querySelector(s);

const state = {
    meta: null,
    stocks: [],
    data: {},              // 檔名 → JSON
    hidden: new Set(),     // 被篩掉的股票代號
    off: new Set(load('dash.offWidgets', [])),   // 使用者隱藏的模組
    modules: {},           // id → 模組
};

function load(key, d) { try { return JSON.parse(localStorage.getItem(key)) ?? d; } catch { return d; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

const color = symbol => {
    const i = state.stocks.findIndex(s => s.symbol === symbol);
    return `var(${PALETTE[(i < 0 ? 0 : i) % PALETTE.length]})`;
};

async function fetchJSON(name) {
    const r = await fetch(`data/${name}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${name} ${r.status}`);
    return r.json();
}

async function loadModules() {
    await Promise.all(layout.map(async item => {
        try {
            state.modules[item.id] = (await import(`./widgets/${item.id}.js`)).default;
        } catch (e) {
            state.modules[item.id] = null;   // 尚未完成的模組：顯示「開發中」
            if (!String(e).includes('Failed to fetch') && !String(e).includes('404')) console.warn(item.id, e);
        }
    }));
}

async function loadData() {
    const names = new Set(['meta.json']);
    Object.values(state.modules).forEach(m => (m?.data || []).forEach(n => names.add(n)));
    const entries = await Promise.all([...names].map(async n => {
        try { return [n, await fetchJSON(n)]; } catch { return [n, null]; }
    }));
    state.data = Object.fromEntries(entries);
    state.meta = state.data['meta.json'];
    state.stocks = state.meta?.stocks || [];
}

/* ---------------- 股票篩選列 ---------------- */
function renderFilter() {
    const all = state.stocks;
    const groups = [['all', '全部'], ['main', '主要'], ['watch', '觀察']];
    const visible = all.filter(s => !state.hidden.has(s.symbol));
    const activeGroup = visible.length === all.length ? 'all'
        : groups.slice(1).find(([g]) => visible.length && visible.every(s => s.group === g) && all.filter(s => s.group === g).length === visible.length)?.[0];
    $('#filter').innerHTML =
        groups.map(([g, label]) => `<button class="grp ${activeGroup === g ? 'active' : ''}" data-group="${g}">${label}</button>`).join('') +
        '<span class="sep"></span>' +
        all.map(s => `<button class="stk ${state.hidden.has(s.symbol) ? 'off' : ''}" data-sym="${s.symbol}" style="--c:${color(s.symbol)}"><i></i>${fmt.esc(s.name)}</button>`).join('');
}

$('#filter').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const all = state.stocks.map(s => s.symbol);
    if (b.dataset.group) {
        const g = b.dataset.group;
        state.hidden = new Set(g === 'all' ? [] : state.stocks.filter(s => s.group !== g).map(s => s.symbol));
    } else {
        const s = b.dataset.sym;
        const visible = all.filter(x => !state.hidden.has(x));
        if (visible.length === all.length) state.hidden = new Set(all.filter(x => x !== s));       // 第一次點：只看這檔
        else if (visible.length === 1 && visible[0] === s) state.hidden.clear();                  // 再點唯一那檔：恢復全部
        else state.hidden.has(s) ? state.hidden.delete(s) : state.hidden.add(s);                  // 其他：加入／移除
    }
    renderFilter();
    renderWidgets();
});

/* ---------------- 版面設定（顯示／隱藏模組） ---------------- */
function renderLayoutMenu() {
    $('#layoutMenu').innerHTML = layout.map(item => {
        const m = state.modules[item.id];
        return `<label><input type="checkbox" data-id="${item.id}" ${state.off.has(item.id) ? '' : 'checked'}> ${fmt.esc(m?.title || item.title || item.id)}${m ? '' : '（開發中）'}</label>`;
    }).join('');
}
$('#layoutBtn').addEventListener('click', () => { $('#layoutMenu').hidden = !$('#layoutMenu').hidden; });
$('#layoutMenu').addEventListener('change', e => {
    const id = e.target.dataset.id;
    e.target.checked ? state.off.delete(id) : state.off.add(id);
    save('dash.offWidgets', [...state.off]);
    renderWidgets();
});
document.addEventListener('click', e => {
    if (!e.target.closest('#layoutMenu, #layoutBtn')) $('#layoutMenu').hidden = true;
});

/* ---------------- 模組 ---------------- */
function renderWidgets() {
    const selected = state.stocks.filter(s => !state.hidden.has(s.symbol));
    const grid = $('#grid');
    grid.innerHTML = '';
    for (const item of layout) {
        if (state.off.has(item.id)) continue;
        const m = state.modules[item.id];
        const card = document.createElement('section');
        card.className = `widget ${item.size === 'half' ? 'half' : 'full'}`;
        card.dataset.id = item.id;
        card.innerHTML = `<header><h2>${fmt.esc(m?.title || item.title || item.id)}</h2><small class="sub"></small></header><div class="body"></div>`;
        grid.append(card);
        const body = card.querySelector('.body');
        if (!m) { body.innerHTML = '<p class="placeholder">這個區塊開發中。</p>'; continue; }
        const missing = (m.data || []).filter(n => !state.data[n]);
        if (missing.length) { body.innerHTML = `<p class="placeholder">資料尚未產生：${missing.join('、')}</p>`; continue; }
        try {
            m.render(body, {
                data: state.data, meta: state.meta, stocks: selected, allStocks: state.stocks,
                color, fmt, charts, setSubtitle: t => { card.querySelector('.sub').textContent = t || ''; }
            });
        } catch (e) {
            console.error(item.id, e);
            body.innerHTML = `<p class="placeholder">這個區塊發生錯誤：${fmt.esc(e.message)}</p>`;
        }
    }
}

function renderHeader() {
    const m = state.meta;
    if (!m) { $('#updated').textContent = '資料尚未產生'; return; }
    const t = new Date(m.updated);
    $('#updated').textContent = `資料更新：${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}・股價到 ${fmt.md(m.latest?.prices)}`;
}

async function refresh() {
    try {
        const meta = await fetchJSON('meta.json');
        if (state.meta && meta.updated === state.meta.updated) return;   // 沒有新資料
        await loadData();
        renderHeader();
        renderFilter();
        renderWidgets();
    } catch (e) {
        $('#updated').textContent = '資料載入失敗，稍後自動重試';
    }
}

(async () => {
    await loadModules();
    await loadData();
    renderHeader();
    renderFilter();
    renderLayoutMenu();
    renderWidgets();
    setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
