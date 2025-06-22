(function() {
    let currentIndex = 0;
    let questions = [];
    let answers = {};
    let marks = {};

    // 常量定義
    const QUESTION_TYPES = {
        MULTIPLE_CHOICE: '複選題',
        MULTIPLE_ANSWER_SINGLE_CHOICE: '單選題多答', // 根據您的定義
        SINGLE_CHOICE: '單選題' // 假設還有單選題
    };
    const QUESTIONS_PER_COLUMN = 25; // 測驗結果分欄顯示的題目數量
    const POINTS_PER_CORRECT_ANSWER = 2;
    const PENALTY_PER_INCORRECT_ANSWER = 0.7;

    // 快取 DOM 元素
    const DOMElements = {
        quizSelector: null,
        loadQuizBtn: null,
        quizTitle: null,
        questionContainer: null,
        progressText: null,
        quizProgress: null,
        questionNav: null,
        clearFeedbackBtn: null,
        submitQuizBtn: null,
        scoreDisplay: null,
        prevQuestionBtn: null,
        toggleMarkBtn: null,
        nextQuestionBtn: null
    };

    function cacheDOMElements() {
        DOMElements.quizSelector = document.getElementById("quizSelector");
        DOMElements.loadQuizBtn = document.getElementById("loadQuizBtn");
        DOMElements.quizTitle = document.getElementById("quizTitle");
        DOMElements.questionContainer = document.getElementById("question-container");
        DOMElements.progressText = document.getElementById("progress-text");
        DOMElements.quizProgress = document.getElementById("quiz-progress");
        DOMElements.questionNav = document.getElementById("question-nav");
        DOMElements.clearFeedbackBtn = document.getElementById("clearFeedbackBtn");
        DOMElements.submitQuizBtn = document.getElementById("submitQuizBtn");
        DOMElements.scoreDisplay = document.getElementById("score");
        DOMElements.prevQuestionBtn = document.getElementById("prevQuestionBtn");
        DOMElements.toggleMarkBtn = document.getElementById("toggleMarkBtn");
        DOMElements.nextQuestionBtn = document.getElementById("nextQuestionBtn");
    }

    async function loadSelectedQuiz() {
        try {
            const selectedFile = DOMElements.quizSelector.value;
            const selectedText = DOMElements.quizSelector.options[DOMElements.quizSelector.selectedIndex].textContent;

            DOMElements.quizTitle.textContent = selectedText;
            
            // 清空之前的答案和標記，重置測驗狀態
            answers = {};
            marks = {};
            currentIndex = 0; // 重置當前題目索引

            const res = await fetch(`./quiz_json/${selectedFile}`);
            if (!res.ok) throw new Error(`載入題庫失敗: ${selectedFile}`);
            
            questions = await res.json();
            renderSidebar();
            renderQuestion();
            updateProgress(); // 重置進度條
            updateButtons(); // 確保按鈕狀態正確
        } catch (error) {
            console.error("錯誤:", error);
            alert(`題庫載入失敗，請確認檔案是否存在。詳細錯誤: ${error.message}`);
        }
    }

    async function populateQuizList() {
        try {
            const res = await fetch("./exams.json");
            if (!res.ok) throw new Error("載入測驗列表失敗");
            const quizList = await res.json();

            quizList.forEach(quiz => {
                let option = document.createElement("option");
                option.value = quiz.file;
                option.textContent = `${quiz.id}-${quiz.name}`;
                DOMElements.quizSelector.appendChild(option);
            });
        } catch (error) {
            console.error("載入測驗列表錯誤:", error);
            alert("測驗列表載入失敗。");
        }
    }

    function renderSidebar() {
        const nav = DOMElements.questionNav;
        nav.innerHTML = ""; // 清空題目列表
        
        let rowContainer;
        
        questions.forEach((q, i) => {
            if (i % 5 === 0) {
                // 每 5 題建立新行
                rowContainer = document.createElement("div");
                rowContainer.classList.add("question-row");
                nav.appendChild(rowContainer);
            }
            
            const btn = document.createElement("button");
            btn.textContent = `${i + 1}`;
            // 根據答案和標記狀態添加 class
            const classList = [];
            if (answers[i] && answers[i].length > 0) { // 檢查答案是否存在且長度大於0
                classList.push("answered");
            }
            if (marks[i]) {
                classList.push("marked");
            }
            if (i === currentIndex) { // 當前題目也應該有特殊樣式
                classList.push("current-question");
            }
            btn.className = classList.join(" ").trim();
            btn.dataset.questionIndex = i; // 將索引存儲在 data 屬性中
            
            rowContainer.appendChild(btn);
        });
    }

    function renderQuestion() {
        const q = questions[currentIndex];
        const container = DOMElements.questionContainer;

        const imagesHTML = q.question_images.map(src => `<img src="${src}" class="question-image" alt="題目圖片">`).join("");

        container.innerHTML = `
            <div class="question-block">
                <h3 class="question-title">第 ${currentIndex + 1} 題: ${q.question}</h3>
                ${imagesHTML}
                <form id="options-form">
                    <fieldset>
                        <legend>請選擇答案：(${q.type})</legend>
                        ${q.options.map((opt, optIndex) => `
                            <label class="option-block" data-option-index="${optIndex + 1}">
                                <input type="${[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTIPLE_ANSWER_SINGLE_CHOICE].includes(q.type) ? 'checkbox' : 'radio'}"
                                name="opt" value="${opt.text.charAt(0)}"
                                ${answers[currentIndex] && answers[currentIndex].includes(opt.text.charAt(0)) ? "checked" : ""}>
                                <span>${opt.text.charAt(0)}. ${opt.text.slice(1)}</span>
                                ${opt.images.map(src => `<img src="${src}" class="option-image" alt="選項圖片">`).join("")}
                            </label>
                            <hr>
                        `).join("")}
                    </fieldset>
                </form>
            </div>
        `;

        // 確保交卷後選項是禁用的
        if (DOMElements.quizTitle.textContent.includes("總分")) { // 簡單判斷是否已交卷
             document.querySelectorAll("#options-form input").forEach(input => {
                input.disabled = true;
            });
        }
    }

    function prevQuestion() {
        saveAnswer();
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion();
            renderSidebar();
        }
    }

    function nextQuestion() {
        saveAnswer();
        if (currentIndex < questions.length - 1) {
            currentIndex++;
            renderQuestion();
        }
        renderSidebar();
    }

    function saveAnswer() {
        const form = document.querySelector("#options-form");
        if (!form) return; // 如果表單不存在，則不執行
        
        const selectedInputs = Array.from(form.querySelectorAll("input:checked"));
        const selectedOptions = selectedInputs.map(input => input.value);

        if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTIPLE_ANSWER_SINGLE_CHOICE].includes(questions[currentIndex].type)) {
            answers[currentIndex] = selectedOptions; // 多選存為陣列
        } else {
            answers[currentIndex] = selectedOptions[0] || ""; // 單選存為單值
        }

        updateProgress();
    }

    function toggleMark() {
        marks[currentIndex] = !marks[currentIndex];
        renderSidebar();
    }

    function calculateScoreAndFeedback() {
        let score = 0;
        let errorQuestions = []; // 用於儲存所有錯誤題目的資訊

        questions.forEach((q, i) => {
            const isMultipleChoice = [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTIPLE_ANSWER_SINGLE_CHOICE].includes(q.type);
            const correct = Array.isArray(q.answer) ? q.answer.slice().sort() : [q.answer].slice().sort(); // 確保正確答案是陣列並排序
            const userAns = answers[i] ? (Array.isArray(answers[i]) ? answers[i].slice().sort() : [answers[i]].slice().sort()) : []; // 確保用戶答案是陣列並排序

            const isCorrect = isMultipleChoice
                ? JSON.stringify(userAns) === JSON.stringify(correct)
                : userAns[0] === correct[0];

            if (isCorrect) {
                score += POINTS_PER_CORRECT_ANSWER;
            } else {
                if (userAns.length > 0) { // 如果有作答但答錯
                    score -= PENALTY_PER_INCORRECT_ANSWER;
                }
                // 儲存錯誤題目的詳細資訊
                const userAnsText = userAns.length > 0 ? userAns.join(", ") : "未答";
                const correctAnsText = correct.join(", ");
                errorQuestions.push(`❌ 第 ${i + 1} 題：你的答案 ${userAnsText}，正確答案 ${correctAnsText}<br>`);
            }
        });

        let feedbackLeftColumn = "";
        let feedbackRightColumn = "";
        const errorCount = errorQuestions.length;

        // 計算每欄應該有多少題目
        const questionsPerColumn = Math.ceil(errorCount / 2);

        // 將錯誤題目平均分配到兩欄
        for (let i = 0; i < errorCount; i++) {
            if (i < questionsPerColumn) {
                feedbackLeftColumn += errorQuestions[i];
            } else {
                feedbackRightColumn += errorQuestions[i];
            }
        }

        return { score, feedbackLeftColumn, feedbackRightColumn, errorCount };
    }

    function submitQuiz() {
        // 如果已經顯示了回饋（表示已經交卷），則不再重複執行
        if (document.getElementById("quiz-feedback")) {
            return;
        }

        const confirmSubmit = confirm("您確定要交卷並計分嗎？交卷後將無法修改答案。");
        if (!confirmSubmit) {
            return; // 如果使用者點擊取消，則停止執行後續邏輯
        }

        saveAnswer(); // 確保儲存最後一題答案

        // 移除舊的回饋結果 (雖然上面有檢查，但保險起見再次移除)
        document.getElementById("quiz-feedback")?.remove();

        const { score, feedbackLeftColumn, feedbackRightColumn, errorCount } = calculateScoreAndFeedback();

        DOMElements.scoreDisplay.innerHTML = `<h4>總分：${score.toFixed(1)} 分</h4>`;

        // 根據是否有錯誤題目來顯示不同的標題和內容
        const feedbackTitle = errorCount > 0 ? `您有 ${errorCount} 題答錯或未答：` : "恭喜您，全部答對！";
        const feedbackContent = errorCount > 0 ? `
            <div class="feedback-columns">
                <div class="feedback-left">${feedbackLeftColumn || "<p>此欄無錯誤答案</p>"}</div>
                <div class="feedback-right">${feedbackRightColumn || "<p>此欄無錯誤答案</p>"}</div>
            </div>
        ` : `<p class="all-correct-message">您是個天才！</p>`; // 全對時顯示的訊息

        // 插入新的回饋結果
        DOMElements.nextQuestionBtn.parentElement.insertAdjacentHTML("afterend", `
            <div id="quiz-feedback" class="feedback-container">
                <hr>
                <h3>${feedbackTitle}</h3>
                ${feedbackContent}
            </div>
        `);

        // 禁用所有選項
        document.querySelectorAll("#options-form input").forEach(input => {
            input.disabled = true;
        });

        updateButtons();
    }

    function updateButtons() {
        const feedbackContainer = document.getElementById("quiz-feedback");
        DOMElements.clearFeedbackBtn.style.display = feedbackContainer ? "inline-block" : "none";
        DOMElements.submitQuizBtn.style.display = feedbackContainer ? "none" : "inline-block";
    }

    function clearFeedback() {
        document.getElementById("quiz-feedback")?.remove();
        DOMElements.scoreDisplay.innerHTML = ""; // 清空分數顯示

        // 清除所有作答紀錄
        answers = {}; // 直接賦值空物件
        marks = {}; // 直接賦值空物件
        currentIndex = 0; // 回到第一題

        // 重新啟用所有選項並清除選中狀態
        // 渲染第一題確保選項重置
        renderQuestion(); 

        // 確保 `.answered` 和 `.marked` 樣式被移除 (renderSidebar 會處理)
        renderSidebar(); 

        updateProgress(); // 進度條回歸 0%
        updateButtons(); // 更新按鈕狀態
    }

    function updateProgress() {
        const answeredCount = Object.values(answers).filter(ans => {
            // 判斷答案是否為有效作答：陣列長度大於 0 或字串非空
            return (Array.isArray(ans) && ans.length > 0) || (typeof ans === 'string' && ans !== '');
        }).length;
        
        const totalQuestions = questions.length;
        const percentage = totalQuestions > 0 ? ((answeredCount / totalQuestions) * 100).toFixed(1) : 0;

        DOMElements.quizProgress.value = percentage;
        DOMElements.progressText.textContent = `進度：${percentage}%`;
    }

    // 事件綁定
    function setupEventListeners() {
        DOMElements.loadQuizBtn.addEventListener('click', loadSelectedQuiz);
        DOMElements.clearFeedbackBtn.addEventListener('click', clearFeedback);
        // 將 submitQuizBtn 的事件監聽器直接指向 submitQuiz 函式
        DOMElements.submitQuizBtn.addEventListener('click', submitQuiz); 
        DOMElements.prevQuestionBtn.addEventListener('click', prevQuestion);
        DOMElements.toggleMarkBtn.addEventListener('click', toggleMark);
        DOMElements.nextQuestionBtn.addEventListener('click', nextQuestion);
        
        // 題目導航按鈕的事件委派
        DOMElements.questionNav.addEventListener('click', function(event) {
            if (event.target.tagName === 'BUTTON' && event.target.dataset.questionIndex) {
                saveAnswer(); // 儲存當前題目答案
                currentIndex = parseInt(event.target.dataset.questionIndex);
                renderQuestion();
                renderSidebar(); // 重新渲染側邊欄以更新當前題目樣式
            }
        });

        // 全局鍵盤事件監聽器
        document.addEventListener('keydown', function(event) {
            // 如果焦點在輸入框（例如搜尋框、選擇器），則不觸發快捷鍵
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (event.key) {
                case 'ArrowRight': // 右方向鍵
                    nextQuestion();
                    break;
                case 'ArrowLeft': // 左方向鍵
                    prevQuestion();
                    break;
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                    // 數字鍵選擇選項
                    const optionIndex = parseInt(event.key) - 1; // 數字1對應索引0
                    const currentQuestionType = questions[currentIndex]?.type;
                    const options = document.querySelectorAll('#options-form input[name="opt"]');

                    if (options[optionIndex]) {
                        // 如果是單選題，確保其他選項取消選中
                        if (![QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTIPLE_ANSWER_SINGLE_CHOICE].includes(currentQuestionType)) {
                            options.forEach(opt => opt.checked = false);
                        }
                        options[optionIndex].checked = !options[optionIndex].checked; // 切換選中狀態
                        saveAnswer(); // 儲存答案
                    }
                    break;
                case 'Enter': // Enter 鍵觸發交卷確認
                    // 點擊提交按鈕來觸發確認視窗，這樣邏輯會集中
                    DOMElements.submitQuizBtn.click();
                    break;
            }
        });
    }

    // 頁面載入完成時執行
    window.onload = function() {
        cacheDOMElements(); // 快取 DOM 元素
        setupEventListeners(); // 設定事件監聽器
        populateQuizList(); // 先載入測驗列表
        updateButtons(); // 初始化按鈕狀態
        updateProgress(); // 初始化進度條
    };

})(); // IIFE 結束