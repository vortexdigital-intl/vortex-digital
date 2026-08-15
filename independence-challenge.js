/* Vortex Digital - Independence Day Challenge
   Self-contained quiz engine. Builds its own modal UI and wires it to
   any button with id="iday-open-btn" present on the page.

   IMPORTANT DESIGN NOTES (kept here so future edits don't reintroduce bugs):
   - This is a static GitHub Pages site with no backend/database. There is
     no reliable server-side way to stop one person from entering twice
     across different browsers/devices. This is BEST-EFFORT client-side
     protection only (localStorage), clearly not perfect security.
   - The "already participated" lock is set the moment someone actually
     STARTS the quiz (question 1 appears) — not only on final submission.
     This is intentional: it stops someone from playing through all 20
     questions to learn the answers, backing out without submitting, and
     replaying for a better score.
   - Only name/phone/email/age/message are collected from participants.
     Payment/payout account details are deliberately NOT collected from
     everyone — only the actual winner will be contacted separately for
     that, since collecting bank/wallet details from every entrant with
     no real chance of winning is unnecessary and risky.
*/
(function () {

  const STORAGE_KEY = "vx_iday_status"; // "started" | "submitted"
  const WEB3FORMS_KEY = "253be509-0d4d-4e03-a222-bfdd4579478a";

  const QUESTIONS = [
    { q: "The Objectives Resolution was adopted by the Constituent Assembly of Pakistan on which date?", a: ["7 March 1949", "12 March 1949", "23 March 1949", "14 August 1949"], c: 1 },
    { q: "Who presented the Objectives Resolution in the Constituent Assembly of Pakistan?", a: ["Muhammad Ali Jinnah", "Liaquat Ali Khan", "Khawaja Nazimuddin", "Sardar Abdur Rab Nishtar"], c: 1 },
    { q: "Under the Government of India Act 1935, the Federal Court of India was established in which year?", a: ["1935", "1936", "1937", "1940"], c: 2 },
    { q: "Which document is regarded as the first constitutional document of Pakistan after independence?", a: ["Constitution of 1956", "Indian Independence Act 1947", "Government of India Act 1935", "Objectives Resolution"], c: 2 },
    { q: "Who served as the first President of the Constituent Assembly of Pakistan?", a: ["Liaquat Ali Khan", "Muhammad Ali Jinnah", "Khawaja Nazimuddin", "Maulvi Tamizuddin Khan"], c: 1 },
    { q: "Who became the first Speaker of the National Assembly of Pakistan after the 1973 Constitution?", a: ["Fazal Ilahi Chaudhry", "Abdul Jabbar Khan", "Maulvi Tamizuddin Khan", "Khawaja Shahabuddin"], c: 1 },
    { q: "The Constitution of Pakistan 1956 declared Pakistan to be which type of state?", a: ["Federal Republic", "Islamic Republic", "Islamic Federation", "Confederation"], c: 1 },
    { q: "Which constitutional amendment restored the President's power to dissolve the National Assembly under Article 58(2)(b) in the 1980s?", a: ["7th Amendment", "8th Amendment", "9th Amendment", "10th Amendment"], c: 1 },
    { q: "The Simla Conference of 1945 was convened by which Viceroy of India?", a: ["Lord Linlithgow", "Lord Wavell", "Lord Mountbatten", "Lord Irwin"], c: 1 },
    { q: "The Cabinet Mission Plan was announced in which year?", a: ["1945", "1946", "1947", "1948"], c: 1 },
    { q: "Which of the following was NOT a member of the Cabinet Mission sent to India in 1946?", a: ["Lord Pethick-Lawrence", "Sir Stafford Cripps", "A.V. Alexander", "Lord Mountbatten"], c: 3 },
    { q: "The Lucknow Pact between the All-India Muslim League and Indian National Congress was signed in which year?", a: ["1909", "1911", "1916", "1920"], c: 2 },
    { q: "Who was the first permanent President of the All-India Muslim League?", a: ["Aga Khan III", "Muhammad Ali Jinnah", "Sir Sultan Muhammad Shah", "Nawab Salimullah Khan"], c: 0 },
    { q: "The Nehru Report was published in response to which British initiative?", a: ["Simon Commission", "Round Table Conference", "Cripps Mission", "Cabinet Mission"], c: 0 },
    { q: "How many constitutional reforms were included in Quaid-e-Azam's Fourteen Points?", a: ["10", "12", "14", "16"], c: 2 },
    { q: "Which Round Table Conference did Muhammad Ali Jinnah attend as a delegate?", a: ["First only", "Second only", "Third only", "All three"], c: 3 },
    { q: "The Allahabad Address of Allama Iqbal was delivered in which year?", a: ["1928", "1930", "1932", "1935"], c: 1 },
    { q: "Which mountain pass historically connects Pakistan's Gilgit-Baltistan region with China's Xinjiang region?", a: ["Khyber Pass", "Bolan Pass", "Khunjerab Pass", "Lowari Pass"], c: 2 },
    { q: "Which river is formed by the confluence of the Jhelum and Chenab rivers?", a: ["Ravi", "Sutlej", "Panjnad", "Indus"], c: 2 },
    { q: "Which Pakistani archaeological site is associated with one of the earliest known urban civilizations of South Asia?", a: ["Takht-i-Bahi", "Mohenjo-daro", "Rohtas Fort", "Makli"], c: 1 }
  ];

  const TIME_PER_QUESTION = 5; // seconds

  /* =====================================================================
     VERIFIED PARTICIPANTS — shown on the public "View Participants" wall.

     HOW TO ADD SOMEONE (from a real submission email):
       1. Open the email — copy their Full Name, Age, and Message.
       2. Add ONE line here: { name: "...", age: 19, message: "..." }
       3. Only add someone who checked "show me on the public wall" in
          their submission (see the "Public_Wall_Consent" field in the
          email). If that field says "No" or is missing, don't add them.
       4. Scores are intentionally NOT shown publicly — it would let
          people guess who's winning before the announcement.
       5. For anyone under 18: still add them (name + message), but leave
          age out of the entry (or set age to null) — exact age next to a
          minor's name shouldn't be public even with consent, since it
          makes them easier to identify/target.
       6. Save the file and re-upload it to the repo.

     This list is manually curated on purpose — there's no database, so
     this is the only reliable way to show real people (instead of a
     fabricated participant count).
     ===================================================================== */
  const VERIFIED_PARTICIPANTS = [
    { name: "Ahad", age: 19, message: "Proud to be Pakistani" }
    { name: "Talha", age: 18, message: "Pakistan Zindabad♥️♥️" }
  ];

  let state = null;
  let timerInterval = null;

  // ---------- Readable date & time (12-hour, Pakistan Time) ----------
  function formatReadableDateTime(date) {
    try {
      const dateStr = date.toLocaleDateString("en-US", {
        weekday: "long", timeZone: "Asia/Karachi"
      });
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit",
        hour12: true, timeZone: "Asia/Karachi"
      });
      return dateStr + " " + timeStr + " (PKT)";
    } catch (e) {
      return date.toString();
    }
  }

  // ---------- Device model (real model where possible) ----------
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

  function getDeviceInfo() {
    const ua = navigator.userAgent;
    const fallback = parseUserAgentFallback(ua);
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      return navigator.userAgentData.getHighEntropyValues(["model"])
        .then(function (hi) {
          const model = (hi.model && hi.model.trim()) ? hi.model.trim() : null;
          return model ? (model + " (" + fallback.os + ")") : (fallback.deviceType + " - " + fallback.os + " - " + fallback.browser);
        })
        .catch(function () {
          return fallback.deviceType + " - " + fallback.os + " - " + fallback.browser;
        });
    }
    return Promise.resolve(fallback.deviceType + " - " + fallback.os + " - " + fallback.browser);
  }

  // ---------- Location (asks browser permission — visible to the user) ----------
  function getLocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve("Not available"); return; }
      const timeout = setTimeout(function () { resolve("Not shared"); }, 8000);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          clearTimeout(timeout);
          const lat = pos.coords.latitude.toFixed(5);
          const lng = pos.coords.longitude.toFixed(5);
          resolve(lat + ", " + lng + " (https://maps.google.com/?q=" + lat + "," + lng + ")");
        },
        function () {
          clearTimeout(timeout);
          resolve("Not shared");
        },
        { timeout: 7000 }
      );
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getStatus() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setStatus(val) {
    try { localStorage.setItem(STORAGE_KEY, val); } catch (e) { /* ignore */ }
  }

  function buildModal() {
    const overlay = document.createElement("div");
    overlay.className = "iday-overlay";
    overlay.id = "iday-overlay";
    overlay.innerHTML =
      '<div class="iday-modal">' +
        '<button class="iday-close" id="iday-close-btn">✕</button>' +

        '<div class="iday-screen active" id="iday-screen-rules">' +
          '<span class="iday-eyebrow">🇵🇰 14 AUGUST SPECIAL</span>' +
          '<h2 style="margin:10px 0;">Pakistan Independence Day Challenge</h2>' +
          '<p style="color:#dbeafe;">Test your Pakistan knowledge. Beat the clock. Win the prize.</p>' +
          '<ul>' +
            '<li>20 Pakistan-related questions</li>' +
            '<li>' + TIME_PER_QUESTION + ' seconds for every question</li>' +
            '<li>4 answer choices — only one is correct</li>' +
            '<li>Once you start, you cannot restart or replay</li>' +
            '<li>Your device type and (with your permission) approximate location may be requested — this helps us arrange in-person prize payment if needed</li>' +
            '<li>One entry per person — winner is contacted directly</li>' +
          '</ul>' +
          '<div class="iday-prize">🏆 Grand Prize: PKR 10,000</div>' +
          '<button class="btn-gold" id="iday-start-btn" style="width:100%;">🇵🇰 Start the Challenge</button>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-already">' +
          '<div class="iday-already">' +
            '<div class="success-badge">🇵🇰</div>' +
            '<h2>You Have Already Participated</h2>' +
            '<p style="color:#dbeafe;">Only one attempt is allowed per participant. Thank you for taking part in the Vortex Digital Independence Day Challenge!</p>' +
          '</div>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-quiz">' +
          '<div class="iday-topbar"><span id="iday-qcounter">QUESTION 1 / 20</span><span id="iday-livestats">✔0 ✘0 ⏭0</span></div>' +
          '<div class="iday-progress-track"><div class="iday-progress-fill" id="iday-progress-fill" style="width:0%;"></div></div>' +
          '<div class="iday-timer" id="iday-timer">' + TIME_PER_QUESTION + '</div>' +
          '<div class="iday-question" id="iday-question-text"></div>' +
          '<div class="iday-options" id="iday-options"></div>' +
          '<button class="iday-skip" id="iday-skip-btn">SKIP QUESTION</button>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-results">' +
          '<h2 style="text-align:center;">🎉 Challenge Completed!</h2>' +
          '<div class="iday-result-score">' +
            '<span class="big-score" id="iday-final-score">0/20</span>' +
            '<div class="iday-result-level" id="iday-result-level"></div>' +
          '</div>' +
          '<div class="iday-stats-row">' +
            '<div><strong id="iday-r-correct">0</strong>Correct</div>' +
            '<div><strong id="iday-r-wrong">0</strong>Wrong</div>' +
            '<div><strong id="iday-r-skipped">0</strong>Skipped</div>' +
            '<div><strong id="iday-r-accuracy">0%</strong>Accuracy</div>' +
          '</div>' +
          '<button class="btn-gold" id="iday-continue-btn" style="width:100%;">Continue to Entry Form</button>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-form">' +
          '<h2>Complete Your Entry</h2>' +
          '<p style="color:#dbeafe;font-size:14px;">Fill in your details to submit your competition entry.</p>' +
          '<form class="iday-form" id="iday-entry-form">' +
            '<label>Full Name *</label><input type="text" id="iday-name" required>' +
            '<label>Phone Number *</label><input type="tel" id="iday-phone" required>' +
            '<label>Email Address *</label><input type="email" id="iday-email" required>' +
            '<label>Age *</label><input type="number" id="iday-age" min="10" max="100" required>' +
            '<label>Message for Pakistan 🇵🇰</label>' +
            '<textarea id="iday-message" maxlength="300" rows="4" placeholder="Write your Independence Day message…"></textarea>' +
            '<label class="iday-consent"><input type="checkbox" id="iday-consent" required> I confirm that I have provided accurate information and agree to the competition rules.</label>' +
            '<label class="iday-consent"><input type="checkbox" id="iday-wall-consent"> I\'m okay with my first name and message being shown publicly on the participants wall (optional).</label>' +
            '<button type="submit" class="btn-gold" style="width:100%;">🇵🇰 Submit My Entry</button>' +
          '</form>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-done">' +
          '<div style="text-align:center;">' +
            '<div class="success-badge">✓</div>' +
            '<h2>Entry Submitted!</h2>' +
            '<p style="color:#dbeafe;">Thank you for celebrating Pakistan with Vortex Digital.</p>' +
            '<div class="iday-entryid" id="iday-entry-id-display"></div>' +
            '<p style="color:#dbeafe;font-size:14px;">🏆 Grand Prize: PKR 10,000<br>Winner announcement window: <strong>Sunday 23 August, 12:00 AM – Monday 24 August, 12:00 AM</strong>.<br>The winner will be contacted using the information provided.</p>' +
          '</div>' +
        '</div>' +

        '<div class="iday-screen" id="iday-screen-wall">' +
          '<h2>🇵🇰 Participants</h2>' +
          '<p style="color:#dbeafe;font-size:13px;">People taking part in the Independence Day Challenge.</p>' +
          '<div class="iday-wall" id="iday-wall-list"></div>' +
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
    if (getStatus() === "started" || getStatus() === "submitted") {
      showScreen("iday-screen-already");
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
    // Lock replay the moment the quiz actually starts, not just on submit.
    setStatus("started");

    state = {
      order: shuffle(QUESTIONS.map(function (q, i) { return i; })),
      index: 0,
      correct: 0,
      wrong: 0,
      skipped: 0
    };
    showScreen("iday-screen-quiz");
    renderQuestion();
  }

  function currentQuestion() {
    const qIndex = state.order[state.index];
    const original = QUESTIONS[qIndex];
    const optionsWithFlag = original.a.map(function (text, i) {
      return { text: text, correct: i === original.c };
    });
    const shuffledOptions = shuffle(optionsWithFlag);
    return { text: original.q, options: shuffledOptions };
  }

  function renderQuestion() {
    clearInterval(timerInterval);
    const total = state.order.length;
    document.getElementById("iday-qcounter").textContent = "QUESTION " + (state.index + 1) + " / " + total;
    document.getElementById("iday-livestats").textContent =
      "✔" + state.correct + " ✘" + state.wrong + " ⏭" + state.skipped;
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
        setTimeout(advance, 700);
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
      document.querySelectorAll(".iday-option").forEach(function (b) {
        if (b.textContent === state.activeOptions.find(function (o) { return o.correct; }).text) {
          b.classList.add("correct");
        }
      });
    }
    setTimeout(advance, 700);
  }

  function skipQuestion() {
    clearInterval(timerInterval);
    lockOptions();
    state.skipped++;
    setTimeout(advance, 300);
  }

  function advance() {
    state.index++;
    if (state.index >= state.order.length) {
      finishQuiz();
    } else {
      renderQuestion();
    }
  }

  function finishQuiz() {
    clearInterval(timerInterval);
    const total = state.order.length;
    const accuracy = Math.round((state.correct / total) * 100);
    document.getElementById("iday-final-score").textContent = state.correct + "/" + total;
    document.getElementById("iday-r-correct").textContent = state.correct;
    document.getElementById("iday-r-wrong").textContent = state.wrong;
    document.getElementById("iday-r-skipped").textContent = state.skipped;
    document.getElementById("iday-r-accuracy").textContent = accuracy + "%";

let level;
    if (state.correct >= 18) level = "🏆 Pakistan Knowledge Master";
    else if (state.correct >= 15) level = "🥇 Excellent";
    else if (state.correct >= 12) level = "⭐ Very Good";
    else if (state.correct >= 9) level = "👍 Good";
    else if (state.correct >= 5) level = "📚 Keep Learning";
    else level = "🇵🇰 Time to Explore Pakistan's History";
    document.getElementById("iday-result-level").textContent = level;

    showScreen("iday-screen-results");
    launchConfetti();
  }

  function generateEntryId() {
    return "VDIC-" + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  function submitEntry(e) {
    e.preventDefault();
    const name = document.getElementById("iday-name").value.trim();
    const phone = document.getElementById("iday-phone").value.trim();
    const email = document.getElementById("iday-email").value.trim();
    const age = document.getElementById("iday-age").value.trim();
    const message = document.getElementById("iday-message").value.trim();
    const wallConsent = document.getElementById("iday-wall-consent").checked;

    const entryId = generateEntryId();
    const total = state.order.length;
    const accuracy = Math.round((state.correct / total) * 100);
    const submitBtn = document.querySelector("#iday-entry-form button[type=submit]");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting…"; }

    Promise.all([getDeviceInfo(), getLocation()]).then(function (results) {
      const deviceInfo = results[0];
      const locationInfo = results[1];

      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: "New Independence Day Challenge Entry - Vortex Digital",
          from_name: "Vortex Digital Independence Day Challenge",
          "Entry ID": entryId,
          "Full Name": name,
          "Phone": phone,
          "Email": email,
          "Age": age,
          "Message": message,
          "Correct": state.correct,
          "Wrong": state.wrong,
          "Skipped": state.skipped,
          "Score": state.correct + "/" + total,
          "Accuracy": accuracy + "%",
          "Device": deviceInfo,
          "Location": locationInfo,
          "Public_Wall_Consent": wallConsent ? "Yes - okay to show name/message publicly" : "No - do not show publicly",
          "Submitted": formatReadableDateTime(new Date())
        })
      }).catch(function () { /* fail silently, entry still recorded locally */ });

      setStatus("submitted");
      try {
        const wall = JSON.parse(localStorage.getItem("vx_iday_wall") || "[]");
        wall.unshift({ name: name.split(" ")[0], age: (parseInt(age, 10) >= 18 ? parseInt(age, 10) : null), message: message });
        localStorage.setItem("vx_iday_wall", JSON.stringify(wall.slice(0, 20)));
      } catch (err) { /* ignore */ }

      document.getElementById("iday-entry-id-display").textContent = "Entry ID: " + entryId;
      showScreen("iday-screen-done");
    });
  }

  function launchConfetti() {
    const colors = ["#01411C", "#046A38", "#ffffff", "#f59e0b"];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement("div");
      piece.className = "iday-confetti-piece";
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (2 + Math.random() * 1.5) + "s";
      document.body.appendChild(piece);
      setTimeout(function () { piece.remove(); }, 4000);
    }
  }

  function renderWall() {
    let localWall = [];
    try { localWall = JSON.parse(localStorage.getItem("vx_iday_wall") || "[]"); } catch (e) { /* ignore */ }

    const combined = VERIFIED_PARTICIPANTS.concat(localWall);
    const container = document.getElementById("iday-wall-list");

    if (combined.length === 0) {
      container.innerHTML =
        '<div class="iday-wall-item">' +
          '<span class="iday-wall-tag">Sample / Demo</span><br>' +
          '<strong>Ali</strong> (22) — "Proud to be Pakistani! 🇵🇰"' +
        '</div>' +
        '<div class="iday-wall-item">' +
          '<span class="iday-wall-tag">Sample / Demo</span><br>' +
          '<strong>Ayesha</strong> — "Happy Independence Day to us all!"' +
        '</div>' +
        '<p style="font-size:12px;color:#9fb3d1;margin-top:10px;">Be the first to join the challenge!</p>';
      return;
    }

    container.innerHTML = combined.map(function (entry) {
      return '<div class="iday-wall-item">' +
        '<strong>' + (entry.name || "Participant") + '</strong>' +
        (entry.age ? ' (' + entry.age + ')' : '') +
        (entry.message ? ' — "' + entry.message + '"' : '') +
        '</div>';
    }).join("");
  }

  function openWall() {
    document.getElementById("iday-overlay").classList.add("open");
    document.body.style.overflow = "hidden";
    renderWall();
    showScreen("iday-screen-wall");
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
    document.getElementById("iday-entry-form").addEventListener("submit", submitEntry);
  }

  function init() {
    buildModal();
    document.querySelectorAll("#iday-open-btn").forEach(function (btn) {
      btn.addEventListener("click", openOverlay);
    });
    document.querySelectorAll("#iday-view-participants-btn").forEach(function (btn) {
      btn.addEventListener("click", openWall);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();