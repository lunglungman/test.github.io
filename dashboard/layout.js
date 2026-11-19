// 儀表板版面：要顯示哪些區塊、排列順序、寬度。
// 想拿掉某個區塊就把那一行刪掉或註解掉；想加回來就把它加回清單。
// size: 'full' 佔滿整列，'half' 佔半列（手機上一律整列）。
export default [
    { id: 'summary', title: '今日總覽', size: 'full' },        // 今日總覽（Claude，示範模組）
    { id: 'performance', title: '走勢與報酬', size: 'full' },    // 走勢與報酬（issue：W4）
    { id: 'valuation', title: '估值一覽', size: 'half' },      // 估值一覽（issue：W1）
    { id: 'revenue', title: '月營收', size: 'half' },        // 月營收（issue：W5）
    { id: 'institutional', title: '三大法人買賣超', size: 'full' },  // 三大法人買賣超（issue：W2）
    { id: 'margin', title: '融資融券', size: 'full' },         // 融資融券（issue：W3）
];
