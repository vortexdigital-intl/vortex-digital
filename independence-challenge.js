/* =====================================================================
   Vortex Digital — Independence Day Challenge (v3, clean rebuild)
   Single self-contained script. Include on every page:
     <script src="independence-challenge.js" defer></script>
   It auto-injects the promo card into <div id="iday-mount"></div>
   (put that div wherever you want the card to appear on each page)
   and builds its own quiz modal on demand.

   FIXES IN THIS VERSION:
   - Correct state machine: "not_started" -> "in_progress_local" is NOT
     saved as a lock; only two real states are persisted:
       "completed_pending"  = finished 20 questions, entry NOT submitted
       "submitted"           = entry submitted, fully locked
     Someone who finishes the quiz but leaves without submitting will,
     on return, be taken straight back to their saved results + the
     entry form (not blocked, not allowed to replay).
   - Removed geolocation collection entirely. Asking for a person's
     location under a "for prize payment" pretext when it isn't
     actually needed for that is a dark pattern and has been removed.
   - Only real submission-relevant fields are collected: name, phone,
     email, age, message, payment method + matching account details,
     plus quiz results and basic technical fields (device id, user
     agent, IP) for anti-duplicate / support purposes.
   - Submission now sends via FormData (matching the working
     quiz-logic.js pattern) instead of a raw JSON body — the JSON body
     was the reason most fields (and sometimes the whole email) weren't
     arriving reliably through Web3Forms.
   ===================================================================== */
(function () {

  const WEB3FORMS_KEY = "253be509-0d4d-4e03-a222-bfdd4579478a";
  const STATUS_KEY = "vx_iday_status";     // "completed_pending" | "submitted"
  const RESULTS_KEY = "vx_iday_results";   // JSON of last quiz result
  const DEVICE_KEY = "vx_iday_device_id";
  const TIME_PER_QUESTION = 5;

  const QUESTIONS = [
    { q: "What is the official national language of Pakistan?", a: ["Urdu", "Punjabi", "English", "Sindhi"], c: 0 },
    { q: "Pakistan became independent on which date?", a: ["14 August 1947", "23 March 1940", "15 August 1947", "27 Ramadan 1947"], c: 0 },
    { q: "Who is regarded as the founder of Pakistan?", a: ["Allama Iqbal", "Muhammad Ali Jinnah", "Liaquat Ali Khan", "Sir Syed Ahmad Khan"], c: 1 },
    { q: "Who is commonly known as the Poet of the East?", a: ["Faiz Ahmed Faiz", "Mirza Ghalib", "Allama Muhammad Iqbal", "Ahmad Faraz"], c: 2 },
    { q: "The Objectives Resolution was adopted in which year?", a: ["1947", "1949", "1956", "1973"], c: 1 },
    { q: "Who presented the Objectives Resolution in the Constituent Assembly?", a: ["Muhammad Ali Jinnah", "Liaquat Ali Khan", "Khawaja Nazimuddin", "Sardar Abdur Rab Nishtar"], c: 1 },
    { q: "The Lahore Resolution was passed in which year?", a: ["1930", "1935", "1940", "1947"], c: 2 },
    { q: "Who was the first Governor-General of Pakistan?", a: ["Liaquat Ali Khan", "Muhammad Ali Jinnah", "Iskander Mirza", "Ayub Khan"], c: 1 },
    { q: "Who was Pakistan's first Prime Minister?", a: ["Liaquat Ali Khan", "Muhammad Ali Jinnah", "Khawaja Nazimuddin", "Zulfikar Ali Bhutto"], c: 0 },
    { q: "K2, the world's second-highest peak, lies in which Pakistani region?", a: ["Khyber Pakhtunkhwa", "Gilgit-Baltistan", "Azad Kashmir", "Balochistan"], c: 1 },
    { q: "What is the longest river in Pakistan?", a: ["Jhelum", "Chenab", "Indus", "Ravi"], c: 2 },
    { q: "Which historic pass connects Pakistan with Afghanistan?", a: ["Khyber Pass", "Bolan Pass", "Lowari Pass", "Khunjerab Pass"], c: 0 },
    { q: "Which mountain pass connects Gilgit-Baltistan with China?", a: ["Khyber Pass", "Bolan Pass", "Khunjerab Pass", "Lowari Pass"], c: 2 },
    { q: "Which is Pakistan's largest province by area?", a: ["Punjab", "Sindh", "Balochistan", "Khyber Pakhtunkhwa"], c: 2 },
    { q: "What is the national animal of Pakistan?", a: ["Markhor", "Snow Leopard", "Lion", "Himalayan Ibex"], c: 0 },
    { q: "What is the national bird of Pakistan?", a: ["Chukar Partridge", "Shaheen Falcon", "Peacock", "Eagle"], c: 0 },
    { q: "Who wrote the poetry collection 'Bang-e-Dra'?", a: ["Allama Iqbal", "Mirza Ghalib", "Faiz Ahmed Faiz", "Ahmad Faraz"], c: 0 },
    { q: "The Cabinet Mission Plan was announced in which year?", a: ["1945", "1946", "1947", "1948"], c: 1 },
    { q: "Which archaeological site in Pakistan represents an early Indus Valley urban civilization?", a: ["Takht-i-Bahi", "Mohenjo-daro", "Rohtas Fort", "Makli"], c: 1 },
    { q: "The Constitution of 1956 declared Pakistan to be which type of state?", a: ["Federal Republic", "Islamic Republic", "Islamic Federation", "Confederation"], c: 1 }
  ];

  let state = null;
  let timerInterval = null;

  /* ---------- storage helpers ---------- */
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "vx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  /* ---------- readable device info (real model where possible) ---------- */
  function parseUserAgentFallback(ua) {
    let browser = "Unknown Browser";
    if (ua.indexOf("Edg/") > -1) browser = "Microsoft Edge";
    else if (ua.indexOf("Chrome/") > -1) browser = "Chrome";
    else if (ua.indexOf("Firefox/") > -1) browser = "Firefox";
    else if (ua.indexOf("Safari/") > -1) browser = "Safari";

    let os = "Unknown OS";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
    else if (/Mac OS X/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    const deviceType = /Mobile|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop / Laptop";
    return { browser: browser, os: os, deviceType: deviceType };
  }

  function getReadableDeviceInfo() {
    const ua = navigator.userAgent;
    const fallback = parseUserAgentFallback(ua);

    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      return navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"])
        .then(function (hi) {
          const model = (hi.model && hi.model.trim()) ? hi.model.trim() : null;
          return {
            device: model ? model : (fallback.deviceType === "Mobile" ? "Mobile device (exact model not shared by browser)" : "Desktop / Laptop"),
            os: fallback.os + (hi.platformVersion ? " " + hi.platformVersion : ""),
            browser: fallback.browser
          };
        })
        .catch(function () {
          return { device: fallback.deviceType, os: fallback.os, browser: fallback.browser };
        });
    }
    return Promise.resolve({ device: fallback.deviceType, os: fallback.os, browser: fallback.browser });
  }
  function getStatus() { try { return localStorage.getItem(STATUS_KEY); } catch (e) { return null; } }
  function setStatus(v) { try { localStorage.setItem(STATUS_KEY, v); } catch (e) {} }
  function saveResults(r) { try { localStorage.setItem(RESULTS_KEY, JSON.stringify(r)); } catch (e) {} }
  function loadResults() { try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || "null"); } catch (e) { return null; } }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- inject the promo card ---------- */
  function renderCard() {
    const mount = document.getElementById("iday-mount");
    if (!mount) return;

    const status = getStatus();
    let btnLabel = "🇵🇰 ENTER THE CHALLENGE";
    if (status === "submitted") btnLabel = "✅ Entry Submitted";
    else if (status === "completed_pending") btnLabel = "📝 Complete Your Entry";

    mount.innerHTML =
      '<div class="iday-card">' +
        '<span class="iday-eyebrow">🇵🇰 14 AUGUST SPECIAL 🇵🇰</span>' +
        '<h2>Pakistan Independence Day Challenge</h2>' +
        '<p class="iday-sub">Test Your Pakistan Knowledge. Beat the Clock. Win the Prize. 🏆</p>' +
        '<p class="iday-desc">20 questions. ' + TIME_PER_QUESTION + ' seconds per question. One attempt only.</p>' +
        '<div class="iday-prize"><span class="iday-prize-label">GRAND PRIZE</span><strong>PKR 10,000</strong></div>' +
        '<button class="btn-gold" id="iday-open-btn">' + btnLabel + '</button>' +
      '</div>';

    document.getElementById("iday-open-btn").addEventListener("click", openOverlay);
  }

  /* ---------- modal ---------- */
  function buildModal() {
    const overlay = document.createElement("div");
    overlay.className = "iday-overlay";
    overlay.id = "iday-overlay";
    overlay.innerHTML =
      '<div class="iday-modal">' +
        '<button class="iday-close" id="iday-close-btn" aria-label="Close">✕</button>' +

        '<div class="iday-screen active" id="iday-screen-rules">' +
          '<span class="iday-eyebrow">🇵🇰 14 AUGUST SPECIAL</span>' +
          '<h2>Pakistan Independence Day Challenge</h2>' +
          '<p class="iday-sub-text">Test your Pakistan knowledge. Beat the clock. Win the prize.</p>' +
          '<ul class="iday-rules-list">' +
            '<li>20 questions about Pakistan</li>' +
            '<li>' + TIME_PER_QUESTION + ' seconds for each question</li>' +
            '<li>Answer or skip — the choice is yours</li>' +
            '<li>Once you start, you cannot restart or replay</li>' +
            '<li>One entry per person — the winner is contacted directly</li>' +
          '</ul>' +
          '<div class="iday-prize"><span class="iday-prize-label">GRAND PRIZE</span><strong>PKR 10,000</strong></div>' +
          '<button class="btn-gold iday-full" id="iday-start-btn">🇵🇰 Start the Challenge</button>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-quiz">' +
          '<div class="iday-topbar"><span id="iday-qcounter">Question 1 of 20</span><span id="iday-livestats">✔ 0 &nbsp; ✘ 0 &nbsp; ⏭ 0</span></div>' +
          '<div class="iday-progress-track"><div class="iday-progress-fill" id="iday-progress-fill"></div></div>' +
          '<div class="iday-timer" id="iday-timer">' + TIME_PER_QUESTION + '</div>' +
          '<div class="iday-question" id="iday-question-text"></div>' +
          '<div class="iday-options" id="iday-options"></div>' +
          '<button class="iday-skip" id="iday-skip-btn">Skip Question →</button>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-results">' +
          '<h2 class="iday-center">🎉 Challenge Completed!</h2>' +
          '<p id="iday-resume-note" class="iday-resume-note" style="display:none;"></p>' +
          '<div class="iday-result-score">' +
            '<span class="iday-big-score" id="iday-final-score">0/20</span>' +
            '<div class="iday-result-level" id="iday-result-level"></div>' +
          '</div>' +
          '<div class="iday-stats-row">' +
            '<div><strong id="iday-r-correct">0</strong>Correct</div>' +
            '<div><strong id="iday-r-wrong">0</strong>Wrong</div>' +
            '<div><strong id="iday-r-skipped">0</strong>Skipped</div>' +
            '<div><strong id="iday-r-accuracy">0%</strong>Accuracy</div>' +
          '</div>' +
          '<button class="btn-gold iday-full" id="iday-continue-btn">Continue to Entry Form</button>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-form">' +
          '<h2>Complete Your Entry</h2>' +
          '<p class="iday-sub-text">Fill in your details to submit your entry.</p>' +
          '<form class="iday-form" id="iday-entry-form">' +
            '<label>Full Name *</label><input type="text" id="iday-name" required>' +
            '<label>Phone Number *</label><input type="tel" id="iday-phone" required>' +
            '<label>Email Address *</label><input type="email" id="iday-email" required>' +
            '<label>Age *</label><input type="number" id="iday-age" min="10" max="100" required>' +
            '<label>Payment Method *</label>' +
            '<select id="iday-payment-method" required>' +
              '<option value="">Select payment method</option>' +
              '<option value="EasyPaisa">EasyPaisa</option>' +
              '<option value="JazzCash">JazzCash</option>' +
              '<option value="Bank Transfer">Bank Transfer</option>' +
              '<option value="PayPal">PayPal</option>' +
            '</select>' +
            '<div id="iday-payment-fields"></div>' +
            '<label>Message *</label>' +
            '<textarea id="iday-message" minlength="10" maxlength="300" rows="4" placeholder="Write a short message (10–300 characters)…" required></textarea>' +
            '<span class="iday-char-counter" id="iday-char-counter">0 / 300 (min 10)</span>' +
            '<label class="iday-consent"><input type="checkbox" id="iday-consent" required> I confirm the information above is accurate and I agree to the competition rules.</label>' +
            '<button type="submit" class="btn-gold iday-full">🏆 Submit My Entry</button>' +
            '<div id="iday-submit-status"></div>' +
          '</form>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-done">' +
          '<div class="iday-center">' +
            '<div class="iday-success-badge">✓</div>' +
            '<h2>Entry Submitted!</h2>' +
            '<p class="iday-sub-text">Thank you for celebrating Pakistan with Vortex Digital.</p>' +
            '<p class="iday-sub-text">🏆 Grand Prize: PKR 10,000<br>Winner announcement: <strong>Sunday 23 August, 12:00 AM – Monday 24 August, 12:00 AM</strong>.<br>The winner will be contacted directly.</p>' +
          '</div>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-already">' +
          '<div class="iday-center">' +
            '<div class="iday-success-badge">🇵🇰</div>' +
            '<h2>Entry Already Submitted</h2>' +
            '<p class="iday-sub-text">Only one attempt is allowed per participant. Thank you for taking part!</p>' +
          '</div>' +
        '</div>' +

      '</div>';
    document.body.appendChild(overlay);
    wireModal();
  }

  function showScreen(id) {
    document.querySelectorAll(".iday-screen").forEach(function (s) { s.classList.remove("active"); });
    document.getElementById(id).classList.add("active");
  }

  function openOverlay() {
    document.getElementById("iday-overlay").classList.add("open");
    document.body.style.overflow = "hidden";

    const status = getStatus();
    if (status === "submitted") {
      showScreen("iday-screen-already");
    } else if (status === "completed_pending") {
      // Finished the quiz earlier but never submitted — go straight to
      // their saved results + entry form. They do NOT replay questions.
      const saved = loadResults();
      if (saved) {
        populateResults(saved, true);
        showScreen("iday-screen-results");
      } else {
        showScreen("iday-screen-rules");
      }
    } else {
      showScreen("iday-screen-rules");
    }
  }

  function closeOverlay() {
    document.getElementById("iday-overlay").classList.remove("open");
    document.body.style.overflow = "";
    clearInterval(timerInterval);
  }

  function startQuiz() {
    state = {
      order: shuffle(QUESTIONS.map(function (_, i) { return i; })),
      index: 0, correct: 0, wrong: 0, skipped: 0
    };
    showScreen("iday-screen-quiz");
    renderQuestion();
  }

  function currentQuestion() {
    const original = QUESTIONS[state.order[state.index]];
    const opts = shuffle(original.a.map(function (t, i) { return { text: t, correct: i === original.c }; }));
    return { text: original.q, options: opts };
  }

  function renderQuestion() {
    clearInterval(timerInterval);
    const total = state.order.length;
    document.getElementById("iday-qcounter").textContent = "Question " + (state.index + 1) + " of " + total;
    document.getElementById("iday-livestats").textContent = "✔ " + state.correct + "   ✘ " + state.wrong + "   ⏭ " + state.skipped;
    document.getElementById("iday-progress-fill").style.width = Math.round((state.index / total) * 100) + "%";

    const q = currentQuestion();
    state.activeOptions = q.options;
    document.getElementById("iday-question-text").textContent = q.text;

    const optionsEl = document.getElementById("iday-options");
    optionsEl.innerHTML = "";
    q.options.forEach(function (opt) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "iday-option";
      btn.textContent = opt.text;
      btn.addEventListener("click", function () { selectAnswer(btn, opt.correct); });
      optionsEl.appendChild(btn);
    });

    let timeLeft = TIME_PER_QUESTION;
    const timerEl = document.getElementById("iday-timer");
    timerEl.textContent = timeLeft;
    timerEl.classList.remove("warn");

    timerInterval = setInterval(function () {
      timeLeft--;
      timerEl.textContent = Math.max(timeLeft, 0);
      if (timeLeft <= 2) timerEl.classList.add("warn");
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        lockOptions();
        state.skipped++;
        setTimeout(advance, 500);
      }
    }, 1000);
  }

  function lockOptions() {
    document.querySelectorAll(".iday-option").forEach(function (b) { b.disabled = true; });
  }

  function selectAnswer(btn, isCorrect) {
    clearInterval(timerInterval);
    lockOptions();
    if (isCorrect) {
      btn.classList.add("correct");
      state.correct++;
    } else {
      btn.classList.add("wrong");
      state.wrong++;
      const correctText = state.activeOptions.find(function (o) { return o.correct; }).text;
      document.querySelectorAll(".iday-option").forEach(function (b) {
        if (b.textContent === correctText) b.classList.add("correct");
      });
    }
    setTimeout(advance, 600);
  }

  function skipQuestion() {
    clearInterval(timerInterval);
    lockOptions();
    state.skipped++;
    setTimeout(advance, 250);
  }

  function advance() {
    state.index++;
    if (state.index >= state.order.length) finishQuiz();
    else renderQuestion();
  }

  function knowledgeLevel(score) {
    if (score >= 18) return "🏆 Pakistan Knowledge Master";
    if (score >= 15) return "🥇 Excellent";
    if (score >= 12) return "⭐ Very Good";
    if (score >= 9) return "👍 Good";
    if (score >= 5) return "📚 Keep Learning";
    return "🇵🇰 Time to Explore Pakistan's History";
  }

function finishQuiz() {
    clearInterval(timerInterval);
    const total = state.order.length;
    const accuracy = Math.round((state.correct / total) * 100);
    const results = {
      correct: state.correct, wrong: state.wrong, skipped: state.skipped,
      total: total, accuracy: accuracy, level: knowledgeLevel(state.correct)
    };

    // Saved the moment the 20 questions finish — this is what lets us
    // distinguish "finished, not submitted yet" from "never played" if
    // they come back later.
    setStatus("completed_pending");
    saveResults(results);

    populateResults(results, false);
    showScreen("iday-screen-results");
  }

  function populateResults(results, resumed) {
    document.getElementById("iday-final-score").textContent = results.correct + "/" + results.total;
    document.getElementById("iday-result-level").textContent = results.level;
    document.getElementById("iday-r-correct").textContent = results.correct;
    document.getElementById("iday-r-wrong").textContent = results.wrong;
    document.getElementById("iday-r-skipped").textContent = results.skipped;
    document.getElementById("iday-r-accuracy").textContent = results.accuracy + "%";

    const note = document.getElementById("iday-resume-note");
    if (resumed) {
      note.style.display = "block";
      note.textContent = "You already completed this challenge — here are your results. You haven't submitted your entry yet, so please submit below to be included in the competition.";
    } else {
      note.style.display = "none";
    }
  }

  function updatePaymentFields() {
    const method = document.getElementById("iday-payment-method").value;
    const container = document.getElementById("iday-payment-fields");
    container.innerHTML = "";

    if (method === "EasyPaisa" || method === "JazzCash") {
      container.innerHTML =
        '<label>' + method + ' Account Number *</label>' +
        '<input type="tel" id="iday-payment-account" placeholder="03XXXXXXXXX" required>';
    } else if (method === "PayPal") {
      container.innerHTML =
        '<label>PayPal Email / Username *</label>' +
        '<input type="text" id="iday-payment-account" placeholder="PayPal email or username" required>';
    } else if (method === "Bank Transfer") {
      container.innerHTML =
        '<label>Bank Name *</label><input type="text" id="iday-bank-name" required>' +
        '<label>Account Title *</label><input type="text" id="iday-account-title" required>' +
        '<label>IBAN *</label><input type="text" id="iday-iban" placeholder="PKXX XXXX XXXX XXXX XXXX XXXX" required>';
    }
  }

  function submitEntry(e) {
    e.preventDefault();

    if (getStatus() === "submitted") return;

    const name = document.getElementById("iday-name").value.trim();
    const phone = document.getElementById("iday-phone").value.trim();
    const email = document.getElementById("iday-email").value.trim();
    const age = document.getElementById("iday-age").value.trim();
    const method = document.getElementById("iday-payment-method").value;
    const message = document.getElementById("iday-message").value.trim();

    if (message.length < 10) {
      document.getElementById("iday-message").focus();
      return;
    }

    const results = loadResults() || { correct: 0, wrong: 0, skipped: 0, total: 20, accuracy: 0, level: "" };

    /* -----------------------------------------------------------------
       FIX: build a FormData payload (same technique as the working
       quiz-logic.js submission) instead of a raw JSON body. The JSON
       body was the reason most fields — and sometimes the whole email —
       weren't arriving reliably through Web3Forms.
       ----------------------------------------------------------------- */
    const formData = new FormData();
    formData.append("access_key", WEB3FORMS_KEY);
    formData.append("subject", "🏆 Vortex Digital Independence Day Challenge Submission");
    formData.append("from_name", "Vortex Digital Independence Day Challenge");
    formData.append("Full Name", name);
    formData.append("Phone", phone);
    formData.append("Email", email);
    formData.append("Age", age);
    formData.append("Payment Method", method);
    formData.append("Payment Account", document.getElementById("iday-payment-account") ? document.getElementById("iday-payment-account").value : "");
    formData.append("Bank Name", document.getElementById("iday-bank-name") ? document.getElementById("iday-bank-name").value : "");
    formData.append("Account Title", document.getElementById("iday-account-title") ? document.getElementById("iday-account-title").value : "");
    formData.append("IBAN", document.getElementById("iday-iban") ? document.getElementById("iday-iban").value : "");
    formData.append("Message", message);
    formData.append("Correct", results.correct);
    formData.append("Wrong", results.wrong);
    formData.append("Skipped", results.skipped);
    formData.append("Score", results.correct + "/" + results.total);
    formData.append("Accuracy", results.accuracy + "%");
    formData.append("Device ID", getDeviceId());
    formData.append("Submitted At", new Date().toISOString());

    const statusEl = document.getElementById("iday-submit-status");
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    Promise.all([
      fetch("https://api.ipify.org?format=json")
        .then(function (r) { return r.json(); })
        .then(function (d) { return d.ip; })
        .catch(function () { return "Unavailable"; }),
      getReadableDeviceInfo().catch(function () {
        return { device: "Unknown", os: "Unknown", browser: "Unknown" };
      })
    ])
      .then(function (results2) {
        const ip = results2[0];
        const deviceInfo = results2[1];
        formData.append("IP Address", ip);
        formData.append("Device", deviceInfo.device);
        formData.append("Operating System", deviceInfo.os);
        formData.append("Browser", deviceInfo.browser);
      })
      .finally(function () {
        fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: formData
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.success) {
              setStatus("submitted");
              localStorage.removeItem(RESULTS_KEY);
              showScreen("iday-screen-done");
              renderCard();
            } else {
              throw new Error(data.message || "Submission failed");
            }
          })
          .catch(function () {
            statusEl.style.color = "#fca5a5";
            statusEl.textContent = "⚠️ Something went wrong. Please try again.";
            submitBtn.disabled = false;
            submitBtn.textContent = "🏆 Submit My Entry";
          });
      });
  }

  function wireModal() {
    document.getElementById("iday-close-btn").addEventListener("click", closeOverlay);
    document.getElementById("iday-overlay").addEventListener("click", function (e) {
      if (e.target.id === "iday-overlay") closeOverlay();
    });
    document.getElementById("iday-start-btn").addEventListener("click", startQuiz);
    document.getElementById("iday-skip-btn").addEventListener("click", skipQuestion);
    document.getElementById("iday-continue-btn").addEventListener("click", function () {
      showScreen("iday-screen-form");
    });
    document.getElementById("iday-payment-method").addEventListener("change", updatePaymentFields);
    document.getElementById("iday-entry-form").addEventListener("submit", submitEntry);

    const msgField = document.getElementById("iday-message");
    const counter = document.getElementById("iday-char-counter");
    msgField.addEventListener("input", function () {
      counter.textContent = msgField.value.length + " / 300 (min 10)";
    });
  }

  function init() {
    buildModal();
    renderCard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();