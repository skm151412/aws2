document.addEventListener("DOMContentLoaded", () => {
    const TOPICS = [
        { id: 3, label: "Compute" },
        { id: 5, label: "Storage" },
        { id: 6, label: "Database" },
        { id: 7, label: "Networking" },
        { id: 10, label: "Security" },
        { id: 4, label: "Pricing" },
        { id: 11, label: "Monitoring" },
        { id: 1, label: "Cloud Concepts" },
        { id: 2, label: "Infrastructure" },
        { id: 8, label: "Content Delivery" },
        { id: 9, label: "IAM" },
        { id: 12, label: "Billing" }
    ];

    const timerEl = document.getElementById("timer");
    const questionCard = document.getElementById("questionCard");
    const questionText = document.getElementById("questionText");
    const optionsContainer = document.getElementById("optionsContainer");
    const topicNav = document.getElementById("topicNav");
    const questionGrid = document.getElementById("questionGrid");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const submitBtn = document.getElementById("submitBtn");
    const resultEl = document.getElementById("result");
    const loadingMessage = document.getElementById("loadingMessage");
    const errorMessage = document.getElementById("errorMessage");

    const state = {
        questions: [],
        questionsByTopic: {},
        currentTopicId: 3,
        currentIndexInTopic: 0,
        answers: {},
        submittedTopics: {},
        topicScores: {},
        timeLeft: 180 * 60,
        timerHandle: null
    };

    function isTopicChecked(topicId) {
        return state.submittedTopics[topicId] === true;
    }

    const createQuestionId = (item, fallback) => {
        return `c${item.categoryId}_s${item.sourceIndex}_i${fallback}`;
    };

    const validOption = (value) => typeof value === "string" && value.trim().length > 0;

    function formatTime(secondsTotal) {
        const mins = Math.floor(secondsTotal / 60);
        const secs = secondsTotal % 60;
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    function setError(message) {
        errorMessage.textContent = message;
        errorMessage.hidden = false;
        loadingMessage.hidden = true;
        questionCard.hidden = true;
    }

    async function loadCategory(id) {
        const fileName = `output/categorized/category_${String(id).padStart(2, "0")}.json`;
        const res = await fetch(fileName);
        if (!res.ok) {
            throw new Error(`Failed to fetch ${fileName} (${res.status})`);
        }
        return res.json();
    }

    function normalizeQuestions(categoryJson) {
        const items = Array.isArray(categoryJson.items) ? categoryJson.items : [];
        const normalized = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const options = item.options || {};
            const answer = (item.answer || "").trim();
            const question = (item.question || "").trim();

            if (!question) {
                continue;
            }
            if (!["A", "B", "C", "D"].includes(answer)) {
                continue;
            }
            if (!validOption(options.A) || !validOption(options.B) || !validOption(options.C) || !validOption(options.D)) {
                continue;
            }
            if (!validOption(options[answer])) {
                continue;
            }

            normalized.push({
                id: createQuestionId(item, i),
                topicId: categoryJson.categoryId,
                topicName: categoryJson.categoryName,
                sourceIndex: item.sourceIndex,
                question,
                options: {
                    A: options.A.trim(),
                    B: options.B.trim(),
                    C: options.C.trim(),
                    D: options.D.trim()
                },
                answer
            });
        }

        return normalized;
    }

    function initializeData(categoryPayloads) {
        const allQuestions = [];

        categoryPayloads.forEach((payload) => {
            const normalized = normalizeQuestions(payload);
            if (!state.questionsByTopic[payload.categoryId]) {
                state.questionsByTopic[payload.categoryId] = [];
            }
            state.questionsByTopic[payload.categoryId].push(...normalized);
            allQuestions.push(...normalized);
        });

        state.questions = allQuestions;

        // Fall back to first non-empty topic if default is empty
        if (!state.questionsByTopic[state.currentTopicId] || state.questionsByTopic[state.currentTopicId].length === 0) {
            const topicWithData = TOPICS.find((t) => state.questionsByTopic[t.id] && state.questionsByTopic[t.id].length > 0);
            if (topicWithData) {
                state.currentTopicId = topicWithData.id;
            }
        }
    }

    function currentTopicQuestions() {
        return state.questionsByTopic[state.currentTopicId] || [];
    }

    function currentQuestion() {
        const topicQuestions = currentTopicQuestions();
        return topicQuestions[state.currentIndexInTopic] || null;
    }

    function renderTopics() {
        topicNav.innerHTML = "";

        TOPICS.forEach((topic, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "topic-btn";
            btn.textContent = `${index + 1}. ${topic.label}`;

            const hasData = (state.questionsByTopic[topic.id] || []).length > 0;
            if (!hasData) {
                btn.disabled = true;
            }

            if (topic.id === state.currentTopicId) {
                btn.classList.add("active");
            }

            btn.addEventListener("click", () => {
                state.currentTopicId = topic.id;
                state.currentIndexInTopic = 0;
                renderAll();
            });

            topicNav.appendChild(btn);
        });
    }

    function questionStatus(question) {
        const picked = state.answers[question.id];
        if (!picked) {
            return "not-attempted";
        }
        if (!isTopicChecked(question.topicId)) {
            return "answered";
        }
        return picked === question.answer ? "correct" : "incorrect";
    }

    function renderQuestionGrid() {
        questionGrid.innerHTML = "";
        const topicQuestions = currentTopicQuestions();

        topicQuestions.forEach((q, idx) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "q-btn";
            btn.textContent = String(idx + 1);

            const status = questionStatus(q);
            if (status !== "not-attempted") {
                btn.classList.add(status);
            }
            if (idx === state.currentIndexInTopic) {
                btn.classList.add("current");
            }

            btn.addEventListener("click", () => {
                state.currentIndexInTopic = idx;
                renderAll();
            });

            questionGrid.appendChild(btn);
        });
    }

    function renderQuestionPanel() {
        const q = currentQuestion();
        if (!q) {
            questionCard.hidden = true;
            loadingMessage.hidden = true;
            setError("No valid questions found for this topic.");
            return;
        }

        errorMessage.hidden = true;
        loadingMessage.hidden = true;
        questionCard.hidden = false;

        const localNumber = state.currentIndexInTopic + 1;
        questionText.textContent = `${localNumber}. ${q.question}`;
        const topicChecked = isTopicChecked(state.currentTopicId);

        const selected = state.answers[q.id] || "";
        optionsContainer.innerHTML = "";

        ["A", "B", "C", "D"].forEach((key) => {
            const label = document.createElement("label");
            label.className = "option";

            if (selected === key) {
                label.classList.add("selected");
            }

            if (topicChecked) {
                if (key === q.answer) {
                    label.classList.add("correct");
                } else if (selected === key && selected !== q.answer) {
                    label.classList.add("incorrect");
                }
            }

            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `question_${q.id}`;
            radio.value = key;
            radio.checked = selected === key;
            // Practice mode: keep options editable even after checking answers.
            radio.disabled = false;

            radio.addEventListener("change", () => {
                state.answers[q.id] = key;
                if (isTopicChecked(state.currentTopicId)) {
                    state.topicScores[state.currentTopicId] = calculateTopicScore(state.currentTopicId);
                }
                renderQuestionGrid();
                renderQuestionPanel();
                renderResult();
            });

            const text = document.createTextNode(`${key}) ${q.options[key]}`);
            label.appendChild(radio);
            label.appendChild(text);
            optionsContainer.appendChild(label);
        });

        const topicQuestions = currentTopicQuestions();
        prevBtn.disabled = state.currentIndexInTopic <= 0;
        nextBtn.disabled = state.currentIndexInTopic >= topicQuestions.length - 1;
        submitBtn.disabled = false;
        submitBtn.textContent = topicChecked ? "Recheck Topic" : "Check Topic Answers";
    }

    function renderResult() {
        const checkedTopicIds = Object.keys(state.submittedTopics)
            .map((id) => Number(id))
            .filter((id) => state.submittedTopics[id]);

        if (checkedTopicIds.length === 0) {
            resultEl.hidden = true;
            resultEl.innerHTML = "";
            return;
        }

        const currentTopicScore = state.topicScores[state.currentTopicId];
        let summaryHtml = "";
        if (currentTopicScore) {
            summaryHtml = `
                <p><strong>Current Topic Score:</strong> ${currentTopicScore.correct}/${currentTopicScore.total}</p>
                <p><strong>Attempted in Current Topic:</strong> ${currentTopicScore.attempted}/${currentTopicScore.total}</p>
            `;
        }

        const scoreRows = TOPICS.filter((topic) => state.topicScores[topic.id]).map((topic) => {
            const score = state.topicScores[topic.id];
            return `<li>${topic.label}: ${score.correct}/${score.total} (Attempted ${score.attempted}/${score.total})</li>`;
        }).join("");

        resultEl.hidden = false;
        resultEl.innerHTML = `
            <h2>Topic Practice Results</h2>
            ${summaryHtml}
            <p><strong>Checked Topics:</strong> ${checkedTopicIds.length}</p>
            <ul>${scoreRows}</ul>
        `;
    }

    function renderAll() {
        renderTopics();
        renderQuestionGrid();
        renderQuestionPanel();
        renderResult();
    }

    function tick() {
        timerEl.textContent = formatTime(state.timeLeft);

        if (state.timeLeft <= 0) {
            // Practice mode: timer is informational only, never auto-submits.
            timerEl.textContent = "00:00";
            return;
        }

        state.timeLeft -= 1;
        state.timerHandle = setTimeout(tick, 1000);
    }

    function calculateTopicScore(topicId) {
        const topicQuestions = state.questionsByTopic[topicId] || [];
        let attempted = 0;
        let correct = 0;

        topicQuestions.forEach((q) => {
            const picked = state.answers[q.id];
            if (picked) {
                attempted += 1;
                if (picked === q.answer) {
                    correct += 1;
                }
            }
        });

        return {
            attempted,
            correct,
            total: topicQuestions.length
        };
    }

    function submitCurrentTopic() {
        const topicId = state.currentTopicId;
        // In practice mode, this can be used multiple times after answer changes.
        state.submittedTopics[topicId] = true;
        state.topicScores[topicId] = calculateTopicScore(topicId);
        renderAll();
    }

    prevBtn.addEventListener("click", () => {
        if (state.currentIndexInTopic > 0) {
            state.currentIndexInTopic -= 1;
            renderAll();
        }
    });

    nextBtn.addEventListener("click", () => {
        const total = currentTopicQuestions().length;
        if (state.currentIndexInTopic < total - 1) {
            state.currentIndexInTopic += 1;
            renderAll();
        }
    });

    submitBtn.addEventListener("click", submitCurrentTopic);

    (async () => {
        try {
            const payloads = await Promise.all([
                loadCategory(1),
                loadCategory(2),
                loadCategory(3),
                loadCategory(4),
                loadCategory(5),
                loadCategory(6),
                loadCategory(7),
                loadCategory(8),
                loadCategory(9),
                loadCategory(10),
                loadCategory(11),
                loadCategory(12)
            ]);

            initializeData(payloads);

            if (state.questions.length === 0) {
                setError("No valid questions could be loaded from the category files.");
                return;
            }

            renderAll();
            tick();
        } catch (err) {
            setError(`Failed to load quiz data: ${err.message}`);
        }
    })();
});
