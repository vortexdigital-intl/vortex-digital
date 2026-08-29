/* Vortex Digital - Site Interactions
   1) Header behavior: auto-hides on scroll down, a small minimize (−)
      button on the header lets you hide it manually too, and a
      floating down-arrow (⬇️) button appears to bring it back.
   2) Scroll-reveal: cards and stat blocks fade/slide in as they enter
      the viewport (not just on page load).
   3) Stat counters animate from 0 up to their real number once visible.
   4) Cards get a subtle tilt that follows the cursor on hover, for a
      bit of "alive" depth — respects prefers-reduced-motion.
*/
(function () {

  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Header: minimize / scroll-hide / reveal ---------------- */
  function setupHeaderControls() {
    const header = document.querySelector("header");
    if (!header) return;

    header.classList.add("site-header");

    const minimizeBtn = document.createElement("button");
    minimizeBtn.type = "button";
    minimizeBtn.className = "header-minimize-btn";
    minimizeBtn.setAttribute("aria-label", "Minimize menu");
    minimizeBtn.textContent = "−";
    header.appendChild(minimizeBtn);

    const revealBtn = document.createElement("button");
    revealBtn.type = "button";
    revealBtn.className = "header-reveal-btn";
    revealBtn.setAttribute("aria-label", "Show menu");
    revealBtn.textContent = "⬇️";
    document.body.appendChild(revealBtn);

    function hideHeader() {
      header.classList.add("header-hidden");
      revealBtn.classList.add("show");
    }
    function showHeader() {
      header.classList.remove("header-hidden");
      revealBtn.classList.remove("show");
    }

    minimizeBtn.addEventListener("click", hideHeader);
    revealBtn.addEventListener("click", showHeader);

    let lastY = window.scrollY;
    window.addEventListener("scroll", function () {
      const y = window.scrollY;
      if (y > 90 && y > lastY) {
        hideHeader();
      } else if (y <= 10) {
        showHeader();
      }
      lastY = y;
    }, { passive: true });
  }

  /* ---------------- Scroll-reveal for cards / stat blocks ---------------- */
  function setupScrollReveal() {
    const targets = document.querySelectorAll(".card, .stat-block, .iday-winner-item");
    if (!targets.length) return;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("in-view"); });
      return;
    }

    targets.forEach(function (el) { el.classList.add("reveal-on-scroll"); });

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* ---------------- Count-up for stat numbers ---------------- */
  function setupStatCounters() {
    const nums = document.querySelectorAll(".stat-num");
    if (!nums.length || prefersReducedMotion || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.textContent.replace(/[^0-9]/g, ""), 10);
        if (isNaN(target)) return;
        const start = performance.now();
        const duration = 1200;
        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(target * eased);
          if (progress < 1) requestAnimationFrame(tick);
          else el.textContent = target;
        }
        requestAnimationFrame(tick);
        observer.unobserve(el);
      });
    }, { threshold: 0.4 });

    nums.forEach(function (el) { observer.observe(el); });
  }

  /* ---------------- Subtle cursor-tilt on cards ---------------- */
  function setupCardTilt() {
    if (prefersReducedMotion || window.matchMedia("(pointer: coarse)").matches) return;

    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = "perspective(700px) rotateY(" + (x * 4) + "deg) rotateX(" + (-y * 4) + "deg) translateY(-3px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  function init() {
    setupHeaderControls();
    setupScrollReveal();
    setupStatCounters();
    setupCardTilt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();