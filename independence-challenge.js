/* =====================================================================
   Vortex Digital — Independence Day Challenge WINNERS ANNOUNCEMENT
   The challenge is over — this script no longer runs the quiz. It only
   renders the winners card into <div id="iday-mount"></div> on every
   page. Include on every page exactly as before:
     <script src="independence-challenge.js" defer></script>
   Uses the existing .iday-card / .iday-winners-grid / .iday-winner-item
   styles already in style.css — no CSS changes needed.
   ===================================================================== */
(function () {

  const WINNERS = [
    "Zara Yasmeen",
    "Muhammad Fazal",
    "M. Faizan Ali",
    "Mr. Muhammad Yaqoob",
    "Muhammad Shaheer",
    "Hussain Ali Madni",
    "Raza",
    "Alisha Fatima"
  ];

  function renderCard() {
    const mount = document.getElementById("iday-mount");
    if (!mount) return;

    const winnersHtml = WINNERS.map(function (name) {
      return '<div class="iday-winner-item">🏆 ' + name + '</div>';
    }).join("");

    mount.innerHTML =
      '<div class="iday-card">' +
        '<span class="iday-eyebrow">🇵🇰 INDEPENDENCE CHALLENGE WINNERS 🏆</span>' +
        '<h2>Congratulations to Our Winners!</h2>' +
        '<p class="iday-sub">Thank you to everyone who took part in the Vortex Digital Independence Day Challenge. 🇵🇰</p>' +
        '<div class="iday-winners-grid">' + winnersHtml + '</div>' +
      '</div>';
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderCard);
  } else {
    renderCard();
  }

})();
