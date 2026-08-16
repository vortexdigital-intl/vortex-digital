/*
  Vortex Digital — Independence Day Challenge
  Quiz logic: 20 questions, 10s/question, random option order,
  one-attempt system (device ID + email in localStorage),
  device fingerprint collection, and Web3Forms submission.

  This file only runs on pages that have the quiz modal + result
  modal markup (currently: wall.html).
*/

(function () {
  // ---------------- Question bank (exact, do not reorder answers here) ----------------
  const QUESTIONS = [
    { q: "What is the official national language of Pakistan?", options: ["Urdu", "Punjabi", "English", "Sindhi"], correct: 0 },
    { q: "Pakistan became independent on which date?", options: ["14 August 1947", "23 March 1940", "15 August 1947", "27 Ramadan 1947"], correct: 0 },
    { q: "Who is the founder of Pakistan?", options: ["Allama Iqbal", "Muhammad Ali Jinnah", "Liaquat Ali Khan", "Sir Syed Ahmad Khan"], correct: 1 },
    { q: "Who is commonly known as the Poet of the East?", options: ["Faiz Ahmed Faiz", "Mirza Ghalib", "Allama Muhammad Iqbal", "Ahmad Faraz"], correct: 2 },
    { q: "What is the national animal of Pakistan?", options: ["Markhor", "Snow Leopard", "Lion", "Himalayan Ibex"], correct: 0 },
    { q: "What is the national flower of Pakistan?", options: ["Rose", "Jasmine", "Sunflower", "Tulip"], correct: 1 },
    { q: "What is the capital city of Pakistan?", options: ["Karachi", "Lahore", "Islamabad", "Peshawar"], correct: 2 },
    { q: "Which city is known as the City of Gardens?", options: ["Lahore", "Quetta", "Multan", "Rawalpindi"], correct: 0 },
    { q: "What is the national sport traditionally associated with Pakistan?", options: ["Cricket", "Field Hockey", "Squash", "Football"], correct: 1 },
    { q: "Which is the second-highest mountain in the world?", options: ["Nanga Parbat", "K2", "Broad Peak", "Rakaposhi"], correct: 1 },
    { q: "Who was the first Governor-General of Pakistan?", options: ["Liaquat Ali Khan", "Muhammad Ali Jinnah", "Iskander Mirza", "Ayub Khan"], correct: 1 },
    { q: "The Lahore Resolution was passed in which year?", options: ["1930", "1935", "1940", "1947"], correct: 2 },
    { q: "Which river is the longest river in Pakistan?", options: ["Indus", "Jhelum", "Chenab", "Ravi"], correct: 0 },
    { q: "What is Pakistan's national bird?", options: ["Chukar Partridge", "Shaheen Falcon", "Peacock", "Eagle"], correct: 0 },
    { q: "Which desert is mainly located in Sindh and eastern Punjab?", options: ["Thar Desert", "Cholistan Desert", "Kharan Desert", "Thal Desert"], correct: 0 },
    { q: "Who wrote Bang-e-Dra?", options: ["Allama Iqbal", "Mirza Ghalib", "Faiz Ahmed Faiz", "Ahmad Faraz"], correct: 0 },
    { q: "Which is Pakistan's largest province by area?", options: ["Punjab", "Sindh", "Balochistan", "Khyber Pakhtunkhwa"], correct: 2 },
    { q: "What is the currency of Pakistan?", options: ["Taka", "Rupee", "Riyal", "Dinar"], correct: 1 },
    { q: "Which historic pass connects Pakistan with Afghanistan?", options: ["Khyber Pass", "Bolan Pass", "Lowari Pass", "Khunjerab Pass"], correct: 0 },
    { q: "Who was Pakistan's first Prime Minister?", options: ["Liaquat Ali Khan", "Muhammad Ali Jinnah", "Khawaja Nazimuddin", "Zulfikar Ali Bhutto"], correct: 0 }
  ];

  const QUESTION_TIME = 10; // seconds
  const STORAGE_DEVICE_ID = "vx_challenge_device_id";

  let shuffledQuestions = [];
  let currentIndex = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  let timerInterval = null;
  let timeLeft = QUESTION_TIME;
  let answered = false;

  // ---------------- Helpers ----------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildShuffledQuestions() {
    return QUESTIONS.map(function (item) {
      const optionOrder = shuffle(item.options.map(function (opt, i) { return i; }));
      const options = optionOrder.map(function (i) { return item.options[i]; });
      const correctNewIndex = optionOrder.indexOf(item.correct);
      return { q: item.q, options: options, correctIndex: correctNewIndex };
    });
  }

  function getDeviceId() {
    let id = localStorage.getItem(STORAGE_DEVICE_ID);
    if (!id) {
      id = "vx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(STORAGE_DEVICE_ID, id);
    }
    return id;
  }

  const STORAGE_STATUS = "vx_challenge_status"; // undefined | "completed_pending" | "submitted"
  const STORAGE_RESULTS = "vx_challenge_results"; // JSON: {correct, wrong, skipped, scorePct, level}

  function getStatus() {
    return localStorage.getItem(STORAGE_STATUS);
  }
  function setStatus(val) {
    localStorage.setItem(STORAGE_STATUS, val);
  }
  function saveResults(results) {
    localStorage.setItem(STORAGE_RESULTS, JSON.stringify(results));
  }
  function loadResults() {
    try { return JSON.parse(localStorage.getItem(STORAGE_RESULTS) || "null"); } catch (e) { return null; }
  }

  // ---------------- Quiz flow ----------------
  window.openChallenge = function () {
    const status = getStatus();

    if (status === "submitted") {
      alert("You have already submitted your entry for this challenge. Thank you for taking part! 🇵🇰");
      return;
    }

    if (status === "completed_pending") {
      // They finished the 20 questions before but never submitted — take
      // them straight to their saved results + the entry form. Do NOT
      // let them replay the questions.
      const results = loadResults();
      if (results) {
        populateResultModal(results, { resumed: true });
        return;
      }
      // if results are missing for some reason, fall through and let them play fresh
    }

    shuffledQuestions = buildShuffledQuestions();
    currentIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    skippedCount = 0;
    document.getElementById("quizModal").style.display = "block";
    document.body.style.overflow = "hidden";
    renderQuestion();
  };

  window.closeQuiz = function () {
    document.getElementById("quizModal").style.display = "none";
    document.body.style.overflow = "";
    clearInterval(timerInterval);
  };

  function renderQuestion() {
    answered = false;
    const total = shuffledQuestions.length;
    const item = shuffledQuestions[currentIndex];

    document.getElementById("questionCounter").textContent = "Question " + (currentIndex + 1) + " of " + total;
    document.getElementById("questionNumber").textContent = "QUESTION " + String(currentIndex + 1).padStart(2, "0");
    document.getElementById("questionText").textContent = item.q;
    document.getElementById("progressBar").style.width = Math.round(((currentIndex) / total) * 100) + "%";
    document.getElementById("attemptedCount").textContent = String(correctCount + wrongCount);
    document.getElementById("correctCount").textContent = String(correctCount);
    document.getElementById("skippedCount").textContent = String(skippedCount);

    const answersContainer = document.getElementById("answersContainer");
    answersContainer.innerHTML = "";
    item.options.forEach(function (optionText, idx) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "answer-btn";
      btn.textContent = optionText;
      btn.addEventListener("click", function () { selectAnswer(idx); });
      answersContainer.appendChild(btn);
    });

    startTimer();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timeLeft = QUESTION_TIME;
    document.getElementById("timerNumber").textContent = String(timeLeft);
    document.getElementById("timerText").textContent = timeLeft + "s";
    timerInterval = setInterval(function () {
      timeLeft--;
      document.getElementById("timerNumber").textContent = String(Math.max(timeLeft, 0));
      document.getElementById("timerText").textContent = Math.max(timeLeft, 0) + "s";
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        if (!answered) {
          skippedCount++;
          advance();
        }
      }
    }, 1000);
  }

  function selectAnswer(idx) {
    if (answered) return;
    answered = true;
    clearInterval(timerInterval);
    const item = shuffledQuestions[currentIndex];
    const buttons = document.querySelectorAll("#answersContainer .answer-btn");
    buttons.forEach(function (b) { b.disabled = true; });

    if (idx === item.correctIndex) {
      correctCount++;
    } else {
      wrongCount++;
    }
    setTimeout(advance, 350);
  }

  window.skipQuestion = function () {
    if (answered) return;
    answered = true;
    clearInterval(timerInterval);
    skippedCount++;
    advance();
  };

  function advance() {
    currentIndex++;
    if (currentIndex >= shuffledQuestions.length) {
      finishQuiz();
    } else {
      renderQuestion();
    }
  }

  function knowledgeLevel(scorePct) {
    if (scorePct >= 90) return "🏆 Exceptional";
    if (scorePct >= 75) return "🔥 Excellent";
    if (scorePct >= 60) return "⭐ Strong";
    if (scorePct >= 40) return "👍 Good Attempt";
    return "📚 Keep Learning";
  }

  function finishQuiz() {
    document.getElementById("quizModal").style.display = "none";
    document.body.style.overflow = "";

    const total = shuffledQuestions.length;
    const scorePct = Math.round((correctCount / total) * 100);
    const level = knowledgeLevel(scorePct);
    const results = {
      correct: correctCount,
      wrong: wrongCount,
      skipped: skippedCount,
      scorePct: scorePct,
      level: level
    };

    // Save immediately, the moment the 20 questions are done — this is
    // what lets us tell "finished but didn't submit yet" apart from
    // "never played" if they come back later without submitting.
    setStatus("completed_pending");
    saveResults(results);

    populateResultModal(results, { resumed: false });
  }

  function populateResultModal(results, options) {
    options = options || {};

    document.getElementById("resultCorrect").textContent = String(results.correct);
    document.getElementById("resultWrong").textContent = String(results.wrong);
    document.getElementById("resultSkipped").textContent = String(results.skipped);
    document.getElementById("resultScore").textContent = results.scorePct + "%";
    document.getElementById("iqLevel").textContent = results.level;

    document.getElementById("formCorrect").value = String(results.correct);
    document.getElementById("formWrong").value = String(results.wrong);
    document.getElementById("formSkipped").value = String(results.skipped);
    document.getElementById("formScore").value = results.scorePct + "%";
    document.getElementById("formLevel").value = results.level;
    document.getElementById("formDevice").value = getDeviceId();

    // Technical fingerprint — private, business-record only, never shown publicly
    document.getElementById("formUserAgent").value = navigator.userAgent || "";
    document.getElementById("formScreenRes").value = (screen.width || "") + "x" + (screen.height || "");
    document.getElementById("formTimezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    document.getElementById("formPlatform").value = navigator.platform || "";
    document.getElementById("formSubmissionTime").value = new Date().toISOString();

    // Best-effort IP lookup (client-side, static-site friendly)
    fetch("https://api.ipify.org?format=json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        document.getElementById("formIP").value = data.ip || "";
      })
      .catch(function () {
        document.getElementById("formIP").value = "";
      });

    const noteEl = document.getElementById("resumeNote");
    if (noteEl) {
      if (options.resumed) {
        noteEl.style.display = "block";
        noteEl.textContent = "You've already completed this challenge — here are your results. You haven't submitted your entry yet, so you're not officially part of the competition until you do. Submit below before Sunday, 23 August.";
      } else {
        noteEl.style.display = "none";
      }
    }

    document.getElementById("resultModal").style.display = "block";
    document.body.style.overflow = "hidden";
  }

  // ---------------- Payment method dynamic fields ----------------
  window.updatePaymentFields = function () {
    const method = document.getElementById("paymentMethod").value;
    const container = document.getElementById("paymentFields");
    container.innerHTML = "";

    if (method === "EasyPaisa" || method === "JazzCash") {
      container.innerHTML =
        '<label>' + method + ' Account Number *</label>' +
        '<input type="tel" name="payment_account_number" placeholder="03XXXXXXXXX" required>';
    } else if (method === "PayPal") {
      container.innerHTML =
        '<label>PayPal Email / Username *</label>' +
        '<input type="text" name="payment_paypal" placeholder="PayPal email or username" required>';
    } else if (method === "Bank Transfer") {
      container.innerHTML =
        '<label>Bank Name *</label>' +
        '<input type="text" name="payment_bank_name" placeholder="Bank name" required>' +
        '<label>Account Title *</label>' +
        '<input type="text" name="payment_account_title" placeholder="Account holder name" required>' +
        '<label>IBAN *</label>' +
        '<input type="text" name="payment_iban" placeholder="PKXX XXXX XXXX XXXX XXXX XXXX" required>';
    }
  };

  // ---------------- Message field validation + char counter ----------------
  document.addEventListener("DOMContentLoaded", function () {
    const msgField = document.getElementById("participantMessage");
    const counter = document.getElementById("messageCharCounter");
    const errorMsg = document.getElementById("messageErrorMsg");

    if (msgField && counter) {
      msgField.addEventListener("input", function () {
        const len = msgField.value.length;
        counter.textContent = len + " / 300 (min 10)";
        const invalid = len > 0 && len < 10;
        counter.classList.toggle("char-error", invalid);
        msgField.classList.toggle("field-error", invalid);
        if (errorMsg) errorMsg.classList.toggle("show", invalid);
      });
    }

    const form = document.getElementById("challengeForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();

        const msgVal = msgField ? msgField.value.trim() : "";
        if (msgVal.length < 10 || msgVal.length > 300) {
          if (msgField) msgField.classList.add("field-error");
          if (errorMsg) errorMsg.classList.add("show");
          if (msgField) msgField.focus();
          return;
        }

        const statusEl = document.getElementById("submitStatus");
        const submitBtn = document.getElementById("finalSubmitBtn");
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
        statusEl.textContent = "";

        const formData = new FormData(form);

        fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { Accept: "application/json" },
          body: formData
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.success) {
              setStatus("submitted");
              localStorage.removeItem(STORAGE_RESULTS);
              statusEl.style.color = "#86efac";
              statusEl.textContent = "✅ Entry submitted successfully! We'll be in touch by email.";
              submitBtn.textContent = "✅ Submitted";
              form.querySelectorAll("input, select, textarea, button").forEach(function (el) {
                el.disabled = true;
              });
            } else {
              throw new Error(data.message || "Submission failed");
            }
          })
          .catch(function () {
            statusEl.style.color = "#fca5a5";
            statusEl.textContent = "⚠️ Something went wrong submitting your entry. Please try again.";
            submitBtn.disabled = false;
            submitBtn.textContent = "🏆 SUBMIT MY ENTRY";
          });
      });
    }

    // Reflect this device's status on the start button
    const startBtn = document.querySelector(".challenge-start-btn");
    if (startBtn) {
      const status = getStatus();
      if (status === "submitted") {
        startBtn.textContent = "✅ Challenge Already Completed";
        startBtn.disabled = true;
        startBtn.style.opacity = "0.6";
        startBtn.style.cursor = "not-allowed";
      } else if (status === "completed_pending") {
        startBtn.textContent = "📝 Complete Your Entry";
        // stays enabled — clicking it resumes straight to the results/entry form
      }
    }
  });
})();