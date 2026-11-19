// 共用格式工具。所有模組都應該用這裡的函式，讓數字、顏色在整個儀表板一致。

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 一般數字：千分位；null 顯示「—」 */
export function num(v, digits = 2) {
    if (v == null || Number.isNaN(v)) return '—';
    return Number(v).toLocaleString('zh-TW', { minimumFractionDigits: Number.isInteger(v) ? 0 : Math.min(digits, 2), maximumFractionDigits: digits });
}

/** 百分比，帶正負號：+1.23%、-0.50% */
export function pct(v, digits = 2) {
    if (v == null || Number.isNaN(v)) return '—';
    return `${v > 0 ? '+' : ''}${Number(v).toFixed(digits)}%`;
}

/** 帶正負號的數字（張數、金額）：+1,234、-56 */
export function signed(v, digits = 0) {
    if (v == null || Number.isNaN(v)) return '—';
    return `${v > 0 ? '+' : ''}${num(v, digits)}`;
}

/** 張數：大於一萬顯示「1.2 萬張」 */
export function lots(v) {
    if (v == null) return '—';
    const a = Math.abs(v);
    return a >= 1e4 ? `${(v / 1e4).toFixed(1)} 萬張` : `${num(v, 0)} 張`;
}

/** 營收（資料單位是千元）→ 億元 */
export function revenueYi(thousand) {
    if (thousand == null) return '—';
    return `${num(thousand / 1e5, 1)} 億`;
}

/** 漲跌顏色 class：台股慣例紅漲綠跌。回傳 'up' | 'down' | 'flat' */
export const dir = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

/** 日期 '2026-11-19' → '11/19' */
export const md = d => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');

/** 月份 '2026-10' → '2026/10' */
export const ym = m => (m ? m.replace('-', '/') : '');
