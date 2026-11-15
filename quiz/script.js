(() => {
    'use strict';

    /* ================= 設定 ================= */
    const POINTS_PER_CORRECT = 2;      // 答對得分
    const PENALTY_PER_WRONG = 0.7;     // 答錯倒扣（未作答不扣分）
    const RANDOM_COUNTS = [20, 50, 100];

    const LS = {
        settings: 'bioquiz.settings',
        session: 'bioquiz.session',
        history: 'bioquiz.history',
        wrong: 'bioquiz.wrongbook'
    };

    /* ================= 小工具 ================= */
    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 無痕模式等情況 */ } },
        del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
    };
    const shuffle = arr => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const fmtTime = sec => {
        sec = Math.max(0, Math.floor(sec));
        const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
        return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    };
    const fmtScore = n => (Math.round(n * 10) / 10).toString();
    const fmtDate = ts => {
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    /* ================= 狀態 ================= */
    let exams = [];
    const fileCache = new Map();
    let settings = Object.assign({ mode: 'exam', shuffle: false, theme: 'auto', randomCount: 50 }, store.get(LS.settings, {}));
    let S = store.get(LS.session, null);   // 目前測驗（可續作）
    let Q = [];                            // 目前測驗的題目（已整理）
    let reviewFilter = 'all';
    let homeQuery = '';
    let timerId = null;

    const saveSettings = () => store.set(LS.settings, settings);
    const saveSession = () => { if (S) store.set(LS.session, S); else store.del(LS.session); };

    /* ================= 題庫載入 ================= */
    function loadFile(file) {
        if (!fileCache.has(file)) {
            const p = fetch(`./${file}`).then(r => {
                if (!r.ok) throw new Error(`無法載入 ${file}`);
                return r.json();
            });
            fileCache.set(file, p);
            p.catch(() => fileCache.delete(file));
        }
        return fileCache.get(file);
    }

    function normalize(q, file) {
        const answer = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(a => String(a).trim().toUpperCase());
        return {
            file,
            id: q.id,
            type: q.type,
            multi: q.type === '複選題',
            anyOf: q.type === '單選題多答',  // 單選作答，但多個選項皆給分
            text: String(q.question).replace(/^\s*\d+\s*[.．、]\s*/, ''),
            images: q.question_images || [],
            options: q.options.map(o => {
                const t = String(o.text).trim();
                return { letter: t.charAt(0).toUpperCase(), text: t.slice(1).trim(), images: o.images || [] };
            }),
            answer
        };
    }

    async function resolveQuestions() {
        const files = [...new Set(S.refs.map(r => r.file))];
        const data = await Promise.all(files.map(loadFile));
        const map = new Map();
        files.forEach((f, i) => data[i].forEach(q => map.set(`${f}#${q.id}`, normalize(q, f))));
        const refs = S.refs.filter(r => map.has(`${r.file}#${r.id}`));
        if (refs.length !== S.refs.length) S.refs = refs;
        Q = refs.map(r => map.get(`${r.file}#${r.id}`));
    }

    const examName = file => exams.find(e => e.file === file);

    /* ================= 判分 ================= */
    function judge(q, ans) {
        if (!ans || !ans.length) return 'blank';
        if (q.anyOf) return ans.length === 1 && q.answer.includes(ans[0]) ? 'correct' : 'wrong';
        const a = ans.slice().sort().join(), b = q.answer.slice().sort().join();
        return a === b ? 'correct' : 'wrong';
    }

    function computeResult() {
        let correct = 0, wrong = 0, blank = 0;
        Q.forEach((q, i) => {
            const r = judge(q, S.answers[i]);
            if (r === 'correct') correct++; else if (r === 'wrong') wrong++; else blank++;
        });
        return {
            correct, wrong, blank,
            total: Q.length,
            score: correct * POINTS_PER_CORRECT - wrong * PENALTY_PER_WRONG,
            max: Q.length * POINTS_PER_CORRECT,
            elapsed: S.elapsed,
            date: Date.now()
        };
    }

    /* ================= 錯題本 ================= */
    const wrongKey = q => `${q.file}#${q.id}`;
    function wrongbookAdd(q) {
        const wb = store.get(LS.wrong, {});
        const k = wrongKey(q);
        wb[k] = { file: q.file, id: q.id, count: (wb[k]?.count || 0) + 1, last: Date.now() };
        store.set(LS.wrong, wb);
    }
    function wrongbookRemove(q) {
        const wb = store.get(LS.wrong, {});
        if (wb[wrongKey(q)]) { delete wb[wrongKey(q)]; store.set(LS.wrong, wb); }
    }
    function recordOutcome(q, outcome) {
        if (outcome === 'wrong' || outcome === 'blank') wrongbookAdd(q);
        else if (outcome === 'correct' && S.kind === 'wrongbook') wrongbookRemove(q);
    }

    /* ================= 主題 ================= */
    function applyTheme() {
        const root = document.documentElement;
        if (settings.theme === 'auto') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', settings.theme);
    }
    function toggleTheme() {
        const isDark = settings.theme === 'dark' ||
            (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
        settings.theme = isDark ? 'light' : 'dark';
        saveSettings();
        applyTheme();
    }

    /* ================= 對話框／提示 ================= */
    function modal({ title, body = '', actions = [{ label: '確定', value: 'ok', primary: true }] }) {
        const dlg = $('#modal');
        $('#modalTitle').textContent = title;
        $('#modalBody').innerHTML = body;
        $('#modalActions').innerHTML = actions.map(a =>
            `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" value="${esc(a.value)}">${esc(a.label)}</button>`
        ).join('');
        return new Promise(resolve => {
            dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
            dlg.returnValue = '';
            dlg.showModal();
        });
    }

    let toastTimer;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    /* ================= 路由 ================= */
    function go(view, { push = true } = {}) {
        if (push && location.hash !== `#${view}`) {
            history.pushState(null, '', `#${view}`);
        }
        render(view);
    }

    function render(view) {
        if ((view === 'quiz' || view === 'result') && (!S || !Q.length)) view = 'home';
        if (view === 'result' && !S.submitted) view = 'quiz';
        document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `view-${view}`);
        document.body.dataset.view = view;
        stopTimer();
        closeNav();
        if (view === 'home') renderHome();
        if (view === 'quiz') { renderQuiz(); if (!S.submitted) startTimer(); }
        if (view === 'result') renderResult();
        updateTopbar(view);
        window.scrollTo(0, 0);
    }

    function updateTopbar(view) {
        const inQuiz = view !== 'home' && S;
        $('#topbarTitle').textContent = inQuiz ? S.title : '生物單元測驗';
        $('#homeBtn').hidden = !inQuiz;
        $('#timer').hidden = !(view === 'quiz' && S);
        $('#timer').textContent = S ? fmtTime(S.elapsed) : '';
        updateProgress();
    }

    /* ================= 計時 ================= */
    function startTimer() {
        stopTimer();
        let last = Date.now();
        timerId = setInterval(() => {
            const now = Date.now();
            if (!document.hidden && S && !S.submitted) {
                S.elapsed += (now - last) / 1000;
                $('#timer').textContent = fmtTime(S.elapsed);
                if (Math.floor(S.elapsed) % 5 === 0) saveSession();
            }
            last = now;
        }, 1000);
    }
    function stopTimer() { clearInterval(timerId); timerId = null; }

    /* ================= 首頁 ================= */
    function renderHome() {
        const history = store.get(LS.history, {});
        const wb = store.get(LS.wrong, {});
        const wbCount = Object.keys(wb).length;
        const resumable = S && !S.submitted && Q.length;
        const answered = resumable ? Object.values(S.answers).filter(a => a && a.length).length : 0;

        const q = homeQuery.trim().toLowerCase();
        const list = exams.filter(e => !q || `${e.id} ${e.name}`.toLowerCase().includes(q));
        const done = exams.filter(e => history[e.file]).length;

        $('#view-home').innerHTML = `
            <div class="home">
                <div class="hero">
                    <div>
                        <h1>生物單元測驗</h1>
                        <p class="muted">${exams.length} 個單元 · 已完成 ${done} 個</p>
                    </div>
                    <div class="settings-card">
                        <div class="setting">
                            <span class="setting-label">作答模式</span>
                            <div class="seg" id="modeSeg">
                                <button data-mode="exam" class="${settings.mode === 'exam' ? 'active' : ''}">考試</button>
                                <button data-mode="practice" class="${settings.mode === 'practice' ? 'active' : ''}">練習</button>
                            </div>
                        </div>
                        <p class="setting-desc muted">${settings.mode === 'exam' ? '交卷後才公布答案與分數。' : '每題作答後立即顯示對錯。'}</p>
                        <label class="switch">
                            <input type="checkbox" id="shuffleChk" ${settings.shuffle ? 'checked' : ''}>
                            <span class="switch-track"></span>
                            <span>題目隨機排序</span>
                        </label>
                    </div>
                </div>

                ${resumable ? `
                <div class="resume">
                    <div>
                        <div class="resume-label">上次未完成</div>
                        <div class="resume-title">${esc(S.title)}</div>
                        <div class="muted small">已答 ${answered} / ${Q.length} 題 · 用時 ${fmtTime(S.elapsed)} · ${S.mode === 'exam' ? '考試' : '練習'}模式</div>
                    </div>
                    <div class="resume-actions">
                        <button class="btn" data-action="discard">放棄</button>
                        <button class="btn primary" data-action="resume">繼續作答</button>
                    </div>
                </div>` : ''}

                <div class="tools">
                    <div class="tool-card">
                        <div class="tool-icon wrong">✎</div>
                        <div class="tool-body">
                            <h3>錯題本</h3>
                            <p class="muted small">${wbCount ? `累積 ${wbCount} 題答錯或未答。複習時答對就會移出。` : '目前沒有錯題。交卷後答錯的題目會自動收進來。'}</p>
                        </div>
                        <div class="tool-actions">
                            ${wbCount ? `<button class="btn ghost small" data-action="clear-wrong">清空</button>
                            <button class="btn primary small" data-action="wrongbook">開始複習</button>` : ''}
                        </div>
                    </div>
                    <div class="tool-card">
                        <div class="tool-icon random">⤮</div>
                        <div class="tool-body">
                            <h3>綜合隨機測驗</h3>
                            <p class="muted small">從全部單元隨機抽題。</p>
                        </div>
                        <div class="tool-actions">
                            <select id="randomCount" class="select small" aria-label="題數">
                                ${RANDOM_COUNTS.map(n => `<option value="${n}" ${settings.randomCount === n ? 'selected' : ''}>${n} 題</option>`).join('')}
                            </select>
                            <button class="btn primary small" data-action="random">開始</button>
                        </div>
                    </div>
                </div>

                <div class="units-head">
                    <h2>單元列表</h2>
                    <input type="search" id="unitSearch" class="search" placeholder="搜尋單元（例如：神經、T12）" value="${esc(homeQuery)}">
                </div>
                <div class="units" id="units">
                    ${list.map(e => unitCard(e, history[e.file])).join('') || '<p class="muted empty">找不到符合的單元。</p>'}
                </div>
            </div>`;
    }

    function unitCard(e, h) {
        const pct = h ? Math.max(0, Math.round(h.best / h.max * 100)) : 0;
        const level = !h ? '' : pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'low';
        const inProgress = S && !S.submitted && S.kind === 'unit' && S.file === e.file;
        return `
            <button class="unit ${level}" data-file="${esc(e.file)}">
                <div class="unit-top">
                    <span class="unit-id">${esc(e.id)}</span>
                    ${inProgress ? '<span class="badge">作答中</span>' : ''}
                </div>
                <div class="unit-name">${esc(e.name)}</div>
                <div class="unit-meta">
                    ${h ? `最佳 <b>${fmtScore(h.best)}</b> / ${h.max} · ${h.attempts} 次` : '<span class="muted">尚未作答</span>'}
                </div>
                <div class="unit-bar"><span style="width:${pct}%"></span></div>
            </button>`;
    }

    async function startQuiz({ kind, title, refs, file = null, keepOrder = false }) {
        if (S && !S.submitted && Object.values(S.answers).some(a => a && a.length)) {
            const r = await modal({
                title: '開始新的測驗？',
                body: `<p>「${esc(S.title)}」還沒交卷，開始新測驗會放棄目前的作答。</p>`,
                actions: [{ label: '取消', value: 'cancel' }, { label: '放棄並開始', value: 'ok', primary: true, danger: true }]
            });
            if (r !== 'ok') return;
        }
        if (!keepOrder && (settings.shuffle || kind === 'random' || kind === 'wrongbook')) refs = shuffle(refs);
        S = {
            kind, title, file, refs,
            mode: settings.mode,
            answers: {}, marks: {}, revealed: {},
            current: 0, elapsed: 0,
            submitted: false, result: null,
            startedAt: Date.now()
        };
        reviewFilter = 'all';
        try {
            await resolveQuestions();
        } catch (err) {
            S = null;
            saveSession();
            toast(`題庫載入失敗：${err.message}`);
            return;
        }
        saveSession();
        go('quiz');
    }

    async function startUnit(file) {
        if (S && !S.submitted && S.kind === 'unit' && S.file === file) { go('quiz'); return; }
        const e = examName(file);
        try {
            const data = await loadFile(file);
            startQuiz({ kind: 'unit', file, title: `${e.id} ${e.name}`, refs: data.map(q => ({ file, id: q.id })) });
        } catch (err) {
            toast(`題庫載入失敗：${err.message}`);
        }
    }

    async function startRandom() {
        const n = settings.randomCount;
        toast('正在載入全部題庫…');
        try {
            const all = await Promise.all(exams.map(e => loadFile(e.file).then(d => d.map(q => ({ file: e.file, id: q.id })))));
            const refs = shuffle(all.flat()).slice(0, n);
            startQuiz({ kind: 'random', title: `綜合隨機 ${n} 題`, refs, keepOrder: true });
        } catch (err) {
            toast(`題庫載入失敗：${err.message}`);
        }
    }

    function startWrongbook() {
        const wb = store.get(LS.wrong, {});
        const refs = Object.values(wb).map(w => ({ file: w.file, id: w.id }));
        if (!refs.length) return;
        startQuiz({ kind: 'wrongbook', title: `錯題複習（${refs.length} 題）`, refs });
    }

    /* ================= 作答畫面 ================= */
    const isLocked = i => S.submitted || !!S.revealed[i];

    function renderQuiz() {
        $('#submitBtn').hidden = S.submitted;
        $('#toResultBtn').hidden = !S.submitted;
        $('#reviewFilter').hidden = !S.submitted;
        document.querySelectorAll('#reviewFilter button').forEach(b => b.classList.toggle('active', b.dataset.filter === reviewFilter));
        renderNav();
        renderQuestion();
    }

    function statusOf(i) {
        const ans = S.answers[i];
        if (S.submitted || S.revealed[i]) return judge(Q[i], ans);
        return ans && ans.length ? 'answered' : 'blank';
    }

    function renderNav() {
        const grid = $('#qgrid');
        grid.innerHTML = Q.map((q, i) => {
            const st = statusOf(i);
            const visible = !S.submitted || reviewFilter === 'all' ||
                (reviewFilter === 'wrong' && st !== 'correct') ||
                (reviewFilter === 'marked' && S.marks[i]);
            if (!visible) return '';
            const cls = ['qnum', `st-${st}`, S.marks[i] ? 'marked' : '', i === S.current ? 'current' : ''].join(' ');
            return `<button class="${cls}" data-index="${i}" aria-label="第 ${i + 1} 題">${i + 1}</button>`;
        }).join('') || '<p class="muted small">沒有符合的題目。</p>';

        const answered = Object.values(S.answers).filter(a => a && a.length).length;
        const marked = Object.values(S.marks).filter(Boolean).length;
        if (S.submitted) {
            const r = S.result;
            $('#navStats').innerHTML = `<b>${fmtScore(r.score)}</b> 分 · 答對 ${r.correct}/${r.total}`;
            $('#legend').innerHTML = `
                <span><i class="dot st-correct"></i>答對</span>
                <span><i class="dot st-wrong"></i>答錯</span>
                <span><i class="dot st-blank"></i>未答</span>
                <span><i class="dot marked"></i>標記</span>`;
        } else {
            $('#navStats').innerHTML = `已答 <b>${answered}</b> / ${Q.length}${marked ? ` · 標記 ${marked}` : ''}`;
            $('#legend').innerHTML = S.mode === 'practice' ? `
                <span><i class="dot st-correct"></i>答對</span>
                <span><i class="dot st-wrong"></i>答錯</span>
                <span><i class="dot st-blank"></i>未答</span>
                <span><i class="dot marked"></i>標記</span>` : `
                <span><i class="dot st-answered"></i>已答</span>
                <span><i class="dot st-blank"></i>未答</span>
                <span><i class="dot marked"></i>標記</span>`;
        }
        updateProgress();
        const cur = grid.querySelector('.current');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
    }

    function imagesHTML(srcs, cls) {
        return srcs.map(src => `<img src="${esc(src)}" class="${cls}" alt="題目圖片" loading="lazy" data-zoom>`).join('');
    }

    function renderQuestion() {
        const i = S.current;
        const q = Q[i];
        const ans = S.answers[i] || [];
        const locked = isLocked(i);
        const outcome = locked ? judge(q, ans) : null;
        const unit = examName(q.file);
        const showUnit = S.kind !== 'unit' && unit;

        const typeLabel = q.multi ? '複選題' : q.anyOf ? '單選題（多個答案皆給分）' : '單選題';
        const optionsHTML = q.options.map(o => {
            const selected = ans.includes(o.letter);
            let cls = 'opt';
            if (selected) cls += ' selected';
            if (locked) {
                if (q.answer.includes(o.letter)) cls += ' is-answer';
                if (selected && !q.answer.includes(o.letter)) cls += ' is-wrong';
            }
            return `
                <button class="${cls}" data-letter="${esc(o.letter)}" role="${q.multi ? 'checkbox' : 'radio'}"
                        aria-checked="${selected}" ${locked ? 'aria-disabled="true"' : ''}>
                    <span class="opt-key ${q.multi ? 'square' : ''}">${esc(o.letter)}</span>
                    <span class="opt-text">${esc(o.text)}${o.images.length ? `<span class="opt-images">${imagesHTML(o.images, 'option-image')}</span>` : ''}</span>
                    ${locked && q.answer.includes(o.letter) ? '<span class="opt-flag ok">正解</span>' : ''}
                    ${locked && selected && !q.answer.includes(o.letter) ? '<span class="opt-flag bad">你的答案</span>' : ''}
                </button>`;
        }).join('');

        let feedback = '';
        if (locked) {
            const right = q.answer.join('、');
            const mine = ans.length ? ans.slice().sort().join('、') : '';
            const msg = outcome === 'correct' ? '答對了！' :
                outcome === 'wrong' ? `答錯了。你選 ${mine}，正確答案是 ${right}。` :
                `未作答。正確答案是 ${right}。`;
            feedback = `<div class="feedback ${outcome}">${outcome === 'correct' ? '✓' : '✕'} ${esc(msg)}
                ${q.anyOf ? '<div class="small">本題 ' + esc(right) + ' 皆給分。</div>' : ''}</div>`;
        }

        const needConfirm = !locked && S.mode === 'practice' && q.multi;

        $('#qcard').innerHTML = `
            <div class="qmeta">
                <span class="qno">第 ${i + 1} <small>/ ${Q.length}</small> 題</span>
                <span class="chip ${q.multi ? 'multi' : ''}">${typeLabel}</span>
                ${showUnit ? `<span class="chip ghost">${esc(unit.id)} ${esc(unit.name)}</span>` : ''}
            </div>
            <h2 class="qtext">${esc(q.text)}</h2>
            ${q.images.length ? `<div class="qimages">${imagesHTML(q.images, 'question-image')}</div>` : ''}
            ${q.multi && !locked ? '<p class="muted small hint">可複選，選出所有正確的選項。</p>' : ''}
            <div class="options" role="${q.multi ? 'group' : 'radiogroup'}">${optionsHTML}</div>
            ${needConfirm ? `<button class="btn primary" id="confirmBtn" ${ans.length ? '' : 'disabled'}>確認答案</button>` : ''}
            ${feedback}`;
        $('#qcard').classList.remove('enter');
        void $('#qcard').offsetWidth;
        $('#qcard').classList.add('enter');

        $('#prevBtn').disabled = i === 0;
        $('#nextBtn').textContent = i === Q.length - 1 ? (S.submitted ? '查看成績' : '交卷') : '下一題 →';
        $('#markBtn').textContent = S.marks[i] ? '★ 已標記' : '☆ 標記';
        $('#markBtn').classList.toggle('marked', !!S.marks[i]);
    }

    function selectOption(letter) {
        const i = S.current;
        if (isLocked(i)) return;
        const q = Q[i];
        if (!q.options.some(o => o.letter === letter)) return;
        let ans = (S.answers[i] || []).slice();
        if (q.multi) {
            ans = ans.includes(letter) ? ans.filter(a => a !== letter) : [...ans, letter];
        } else {
            ans = ans[0] === letter ? [] : [letter];
        }
        S.answers[i] = ans;
        if (S.mode === 'practice' && !q.multi && ans.length) reveal(i);
        saveSession();
        renderQuestion();
        renderNav();
    }

    function reveal(i) {
        if (S.revealed[i]) return;
        S.revealed[i] = true;
        recordOutcome(Q[i], judge(Q[i], S.answers[i]));
    }

    function confirmAnswer() {
        const i = S.current;
        if (S.mode !== 'practice' || isLocked(i) || !(S.answers[i] || []).length) return;
        reveal(i);
        saveSession();
        renderQuestion();
        renderNav();
    }

    function goTo(i) {
        if (i < 0 || i >= Q.length) return;
        S.current = i;
        saveSession();
        renderQuestion();
        renderNav();
        closeNav();
        if (window.innerWidth < 900) $('#qcard').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function next() {
        if (S.current < Q.length - 1) goTo(S.current + 1);
        else if (S.submitted) go('result');
        else submit();
    }
    const prev = () => goTo(S.current - 1);

    function toggleMark() {
        S.marks[S.current] = !S.marks[S.current];
        saveSession();
        renderQuestion();
        renderNav();
    }

    function updateProgress() {
        const bar = $('#topbarProgress span');
        if (!S || document.body.dataset.view === 'home') { bar.style.width = '0'; return; }
        const answered = Object.values(S.answers).filter(a => a && a.length).length;
        bar.style.width = `${Q.length ? answered / Q.length * 100 : 0}%`;
    }

    async function submit() {
        if (S.submitted) return;
        const blank = Q.filter((_, i) => !(S.answers[i] || []).length).length;
        const marked = Object.values(S.marks).filter(Boolean).length;
        const warn = [];
        if (blank) warn.push(`還有 <b>${blank}</b> 題未作答`);
        if (marked) warn.push(`有 <b>${marked}</b> 題標記待確認`);
        const r = await modal({
            title: '確定要交卷嗎？',
            body: `${warn.length ? `<p class="warn">${warn.join('，')}。</p>` : '<p>所有題目都已作答。</p>'}
                   <p class="muted small">交卷後無法修改答案。計分：答對 +${POINTS_PER_CORRECT}，答錯 −${PENALTY_PER_WRONG}，未答不計。</p>`,
            actions: [{ label: '繼續作答', value: 'cancel' }, { label: '交卷', value: 'ok', primary: true }]
        });
        if (r !== 'ok') return;

        stopTimer();
        S.submitted = true;
        S.result = computeResult();
        Q.forEach((q, i) => { if (!S.revealed[i]) recordOutcome(q, judge(q, S.answers[i])); });

        if (S.kind === 'unit') {
            const h = store.get(LS.history, {});
            const prevH = h[S.file];
            h[S.file] = {
                best: prevH ? Math.max(prevH.best, S.result.score) : S.result.score,
                last: S.result.score,
                prevLast: prevH ? prevH.last : null,
                max: S.result.max,
                attempts: (prevH?.attempts || 0) + 1,
                date: S.result.date
            };
            store.set(LS.history, h);
        }
        saveSession();
        go('result');
    }

    /* ================= 成績 ================= */
    function renderResult() {
        const r = S.result;
        const pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
        const scorePct = Math.max(0, r.score / r.max);
        const h = S.kind === 'unit' ? store.get(LS.history, {})[S.file] : null;
        const msg = pct === 100 ? '全部答對，太厲害了！' : pct >= 80 ? '表現很好，再看看錯的幾題。' :
            pct >= 60 ? '及格了，錯題值得好好檢討。' : '還有進步空間，先從錯題開始複習吧。';

        const wrongs = Q.map((q, i) => ({ q, i, st: judge(q, S.answers[i]) })).filter(x => x.st !== 'correct');
        const C = 2 * Math.PI * 52;

        $('#view-result').innerHTML = `
            <div class="result">
                <div class="result-hero">
                    <div class="ring" style="--p:${scorePct}">
                        <svg viewBox="0 0 120 120" aria-hidden="true">
                            <circle cx="60" cy="60" r="52" class="ring-bg"/>
                            <circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - scorePct)}"/>
                        </svg>
                        <div class="ring-label"><b>${fmtScore(r.score)}</b><span>/ ${r.max} 分</span></div>
                    </div>
                    <div class="result-summary">
                        <h1>${esc(S.title)}</h1>
                        <p class="lead">${msg}</p>
                        <div class="stats">
                            <div class="stat"><span>正確率</span><b>${pct}%</b></div>
                            <div class="stat ok"><span>答對</span><b>${r.correct}</b></div>
                            <div class="stat bad"><span>答錯</span><b>${r.wrong}</b></div>
                            <div class="stat"><span>未答</span><b>${r.blank}</b></div>
                            <div class="stat"><span>用時</span><b>${fmtTime(r.elapsed)}</b></div>
                        </div>
                        ${h ? `<p class="muted small">此單元最佳 ${fmtScore(h.best)} 分 · 共作答 ${h.attempts} 次${h.prevLast != null ? ` · 上次 ${fmtScore(h.prevLast)} 分` : ''}</p>` : ''}
                        <div class="result-actions">
                            <button class="btn primary" data-action="review">檢討全部題目</button>
                            ${wrongs.length ? `<button class="btn" data-action="retry-wrong">重做錯題（${wrongs.length}）</button>` : ''}
                            <button class="btn" data-action="retry">再測一次</button>
                            <button class="btn ghost" data-action="home">回首頁</button>
                        </div>
                    </div>
                </div>

                ${wrongs.length ? `
                <h2 class="section-title">需要檢討的題目</h2>
                <div class="wrong-list">
                    ${wrongs.map(({ q, i, st }) => {
                        const mine = (S.answers[i] || []).slice().sort().join('、');
                        return `
                        <button class="wrong-item" data-index="${i}">
                            <span class="wrong-no st-${st}">${i + 1}</span>
                            <span class="wrong-text">${esc(q.text)}</span>
                            <span class="wrong-ans">
                                <span class="${st === 'blank' ? 'muted' : 'bad'}">${st === 'blank' ? '未答' : `你：${esc(mine)}`}</span>
                                <span class="ok">正解：${esc(q.answer.join('、'))}</span>
                            </span>
                        </button>`;
                    }).join('')}
                </div>` : '<p class="all-correct">🎉 沒有需要檢討的題目！</p>'}
            </div>`;
    }

    function reviewAt(i, filter = 'all') {
        reviewFilter = filter;
        S.current = i;
        saveSession();
        go('quiz');
    }

    function retry(onlyWrong) {
        const refs = onlyWrong
            ? Q.map((q, i) => ({ q, i })).filter(({ q, i }) => judge(q, S.answers[i]) !== 'correct').map(({ q }) => ({ file: q.file, id: q.id }))
            : S.refs.slice();
        const base = S.title.replace(/^(重做錯題：|再測：)/, '');
        startQuiz({
            kind: onlyWrong ? 'retry' : S.kind,
            file: onlyWrong ? null : S.file,
            title: onlyWrong ? `重做錯題：${base}` : base,
            refs,
            keepOrder: S.kind === 'random' && !onlyWrong
        });
    }

    /* ================= 手機題號抽屜 ================= */
    function openNav() { document.body.classList.add('nav-open'); $('#navBackdrop').hidden = false; }
    function closeNav() { document.body.classList.remove('nav-open'); $('#navBackdrop').hidden = true; }

    /* ================= 事件 ================= */
    function bindEvents() {
        $('#homeBtn').addEventListener('click', () => { if (S && !S.submitted) saveSession(); go('home'); });
        $('#themeBtn').addEventListener('click', toggleTheme);

        // 首頁（事件委派）
        $('#view-home').addEventListener('click', async e => {
            const unit = e.target.closest('.unit');
            if (unit) return startUnit(unit.dataset.file);
            const seg = e.target.closest('#modeSeg button');
            if (seg) { settings.mode = seg.dataset.mode; saveSettings(); renderHome(); return; }
            const act = e.target.closest('[data-action]')?.dataset.action;
            if (act === 'resume') go('quiz');
            if (act === 'discard') {
                const r = await modal({ title: '放棄這次作答？', body: `<p>「${esc(S.title)}」的作答紀錄將被清除。</p>`, actions: [{ label: '取消', value: 'cancel' }, { label: '放棄', value: 'ok', danger: true, primary: true }] });
                if (r === 'ok') { S = null; Q = []; saveSession(); renderHome(); }
            }
            if (act === 'wrongbook') startWrongbook();
            if (act === 'random') startRandom();
            if (act === 'clear-wrong') {
                const r = await modal({ title: '清空錯題本？', body: '<p>所有錯題紀錄都會被刪除，無法復原。</p>', actions: [{ label: '取消', value: 'cancel' }, { label: '清空', value: 'ok', danger: true, primary: true }] });
                if (r === 'ok') { store.del(LS.wrong); renderHome(); toast('已清空錯題本'); }
            }
        });
        $('#view-home').addEventListener('change', e => {
            if (e.target.id === 'shuffleChk') { settings.shuffle = e.target.checked; saveSettings(); }
            if (e.target.id === 'randomCount') { settings.randomCount = Number(e.target.value); saveSettings(); }
        });
        $('#view-home').addEventListener('input', e => {
            if (e.target.id !== 'unitSearch') return;
            homeQuery = e.target.value;
            const history = store.get(LS.history, {});
            const q = homeQuery.trim().toLowerCase();
            const list = exams.filter(x => !q || `${x.id} ${x.name}`.toLowerCase().includes(q));
            $('#units').innerHTML = list.map(x => unitCard(x, history[x.file])).join('') || '<p class="muted empty">找不到符合的單元。</p>';
        });

        // 作答
        $('#qcard').addEventListener('click', e => {
            const img = e.target.closest('img[data-zoom]');
            if (img) { e.stopPropagation(); $('#lightboxImg').src = img.src; $('#lightbox').showModal(); return; }
            const opt = e.target.closest('.opt');
            if (opt) return selectOption(opt.dataset.letter);
            if (e.target.closest('#confirmBtn')) confirmAnswer();
        });
        $('#qgrid').addEventListener('click', e => {
            const b = e.target.closest('.qnum');
            if (b) goTo(Number(b.dataset.index));
        });
        $('#reviewFilter').addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            reviewFilter = b.dataset.filter;
            document.querySelectorAll('#reviewFilter button').forEach(x => x.classList.toggle('active', x === b));
            renderNav();
        });
        $('#prevBtn').addEventListener('click', prev);
        $('#nextBtn').addEventListener('click', next);
        $('#markBtn').addEventListener('click', toggleMark);
        $('#submitBtn').addEventListener('click', submit);
        $('#toResultBtn').addEventListener('click', () => go('result'));
        $('#openNavBtn').addEventListener('click', openNav);
        $('#closeNavBtn').addEventListener('click', closeNav);
        $('#navBackdrop').addEventListener('click', closeNav);

        // 成績
        $('#view-result').addEventListener('click', e => {
            const item = e.target.closest('.wrong-item');
            if (item) return reviewAt(Number(item.dataset.index), 'all');
            const act = e.target.closest('[data-action]')?.dataset.action;
            if (act === 'review') reviewAt(0, 'all');
            if (act === 'retry-wrong') retry(true);
            if (act === 'retry') retry(false);
            if (act === 'home') go('home');
        });

        // 燈箱：點背景關閉
        $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') $('#lightbox').close(); });

        // 鍵盤
        document.addEventListener('keydown', e => {
            if (document.body.dataset.view !== 'quiz' || !S) return;
            if (document.querySelector('dialog[open]')) return;
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key;
            if (k === 'ArrowRight') { e.preventDefault(); if (S.current < Q.length - 1) goTo(S.current + 1); }
            else if (k === 'ArrowLeft') { e.preventDefault(); prev(); }
            else if (/^[1-5]$/.test(k)) {
                const o = Q[S.current].options[Number(k) - 1];
                if (o) selectOption(o.letter);
            } else if (/^[a-eA-E]$/.test(k)) selectOption(k.toUpperCase());
            else if (k === 'm' || k === 'M') toggleMark();
            else if (k === 'Enter' && e.target.tagName !== 'BUTTON') confirmAnswer();
        });

        window.addEventListener('popstate', () => render(location.hash.slice(1) || 'home'));
        window.addEventListener('beforeunload', () => saveSession());
        document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });
    }

    /* ================= 啟動 ================= */
    async function init() {
        applyTheme();
        bindEvents();
        try {
            const r = await fetch('./exams.json');
            if (!r.ok) throw new Error('exams.json');
            exams = await r.json();
        } catch {
            $('#view-home').hidden = false;
            $('#view-home').innerHTML = '<div class="home"><p class="error">測驗列表載入失敗，請重新整理頁面。</p></div>';
            return;
        }
        if (S) {
            try { await resolveQuestions(); } catch { S = null; Q = []; saveSession(); }
        }
        const view = location.hash.slice(1) || 'home';
        history.replaceState(null, '', `#${view}`);
        render(view);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
