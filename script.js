let currentIndex = 0;
let questions = [];
let answers = {};
let marks = {};

async function loadSelectedQuiz() {
  try {
    const selector = document.getElementById("quizSelector");
    const selectedFile = selector.value;
    const selectedText = selector.options[selector.selectedIndex].textContent;

    document.getElementById("quizTitle").textContent = selectedText;

    const res = await fetch(`./quiz_json/${selectedFile}`);
    if (!res.ok) throw new Error("載入題庫失敗");
    
    questions = await res.json();
    renderSidebar();
    renderQuestion();
  } catch (error) {
    console.error("錯誤:", error);
    alert("題庫載入失敗，請確認檔案是否存在。");
  }
}

async function populateQuizList() {
  const res = await fetch("./exams.json");
  const quizList = await res.json();

  const selector = document.getElementById("quizSelector");
  quizList.forEach(quiz => {
    
    let option = document.createElement("option");
    option.value = quiz.file;
    option.textContent = `${quiz.id}-${quiz.name}`;
    selector.appendChild(option);
  });
}

function renderSidebar() {
  const nav = document.getElementById("question-nav");
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
    btn.className = `${answers[i] ? "answered" : ""} ${marks[i] ? "marked" : ""}`.trim();
    btn.onclick = () => {
      saveAnswer();
      currentIndex = i;
      renderQuestion();
      renderSidebar();
    };
    
    rowContainer.appendChild(btn);
  });
}

function renderQuestion() {
  const q = questions[currentIndex];
  const container = document.getElementById("question-container");

  const imagesHTML = q.question_images.map(src => `<img src="${src}" class="question-image">`).join("");

  container.innerHTML = `
    <div class="question-block">
      <h2 class="question-title">${q.question}</h2>
      ${imagesHTML}
      <form id="options-form">
        <fieldset>
          <legend>請選擇答案：(${q.type})</legend>
          ${q.options.map(opt => `
            <label class="option-block">
              <input type="${['複選題', '單選題多答'].includes(q.type) ? 'checkbox' : 'radio'}"
              name="opt" value="${opt.text.charAt(0)}"
              ${answers[currentIndex]?.includes(opt.text.charAt(0)) ? "checked" : ""}>
              <span>${opt.text.charAt(0)}. ${opt.text.slice(1)}</span>
              ${opt.images.map(src => `<img src="${src}" class="option-image">`).join("")}
            </label>
            <hr>
          `).join("")}
        </fieldset>
      </form>
    </div>
  `;
}

function prevQuestion() {
  saveAnswer();
  if (currentIndex > 0) {
    currentIndex--; // 切換到上一題
    renderQuestion();
    renderSidebar(); // 確保題目列表也跟著更新
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
  const selectedOptions = Array.from(form.querySelectorAll("input:checked")).map(input => input.value);

  if (["複選題", "單選題多答"].includes(questions[currentIndex].type)) {
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

function submitQuiz() {
  saveAnswer();
  let score = 0;
  let leftColumn = "";
  let rightColumn = "";

  const oldFeedback = document.getElementById("quiz-feedback");
  if (oldFeedback) oldFeedback.remove();

  questions.forEach((q, i) => {
    const isMultipleChoice = ["複選題", "單選題多答"].includes(q.type);
    const correct = q.answer.slice().sort();
    const userAns = answers[i] ? [].concat(answers[i]).slice().sort() : [];
    const isCorrect = isMultipleChoice
      ? JSON.stringify(userAns) === JSON.stringify(correct) 
      : userAns[0] === correct[0]; // 單選仍用單值比對
    const result = isCorrect ? "✅" : "❌";

    if (isCorrect) {
      score += 2;
    } else if (userAns.length) {
      score -= 0.7;
    }

    const resultText = `${result} 第 ${i + 1} 題：你的答案 ${userAns.join(", ") || "未答"}，正確答案 ${correct.join(", ")}<br>`;

    if (i < 25) {
      leftColumn += resultText;
    } else {
      rightColumn += resultText;
    }
  });

  document.getElementById("score").innerHTML = `<h4>總分：${score.toFixed(1)} 分</h4>`;

  const buttonContainers = document.querySelectorAll(".button-container");
  if (buttonContainers.length > 1) {
    buttonContainers[1].insertAdjacentHTML("afterend", `
      <div id="quiz-feedback" class="feedback-container">
        <hr>
        <div class="feedback-columns">
          <div class="feedback-left">${leftColumn || "<p>左欄無錯誤答案</p>"}</div>
          <div class="feedback-right">${rightColumn || "<p>右欄無錯誤答案</p>"}</div>
        </div>
      </div>
    `);
  }

  // 禁用所有選項（包括未作答）
  document.querySelectorAll("#options-form input").forEach(input => {
    input.disabled = true; // 讓所有選項無法再點擊
  });

  updateButtons();
}

function updateButtons() {
  const feedbackContainer = document.getElementById("quiz-feedback");
  document.querySelector("button[onclick='clearFeedback()']").style.display = feedbackContainer ? "inline-block" : "none";
  document.querySelector("button[onclick='submitQuiz()']").style.display = feedbackContainer ? "none" : "inline-block";
}

function clearFeedback() {
  document.getElementById("quiz-feedback")?.remove();

  // 清除所有作答紀錄
  Object.keys(answers).forEach(key => delete answers[key]); 
  marks = {}

  // 重新開放所有選項
  document.querySelectorAll("#options-form input").forEach(input => {
    input.disabled = false;
    input.checked = false; // 確保選項清空
  });

  // 確保 `.answered` 樣式被移除
  document.querySelectorAll(".answered").forEach(el => {
    el.classList.remove("answered");
  });

  // 🚀 **強制移除 `.marked` 樣式**
  document.querySelectorAll(".marked").forEach(el => {
    el.classList.remove("marked");
  });

  updateProgress(); // 進度條回歸 0%
  renderSidebar(); // 重新渲染側邊欄，確保樣式同步更新
  updateButtons(); // 更新按鈕狀態
}

function updateProgress() {
  // 過濾掉未作答的題目
  const answeredCount = Object.values(answers).filter(ans => ans.length > 0).length;
  const totalQuestions = questions.length;
  const percentage = ((answeredCount / totalQuestions) * 100).toFixed(1);

  document.getElementById("quiz-progress").value = percentage;
  document.getElementById("progress-text").textContent = `進度：${percentage}%`;
}

window.onload = function() {
  populateQuizList(); // 先載入測驗列表
  updateButtons(); // 初始化按鈕狀態
};
