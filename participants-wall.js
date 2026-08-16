/*
  Vortex Digital — Independence Day Challenge
  Shared render script for the participant count + public wall.
  Reads from PARTICIPANTS (see participants-data.js). Include that file
  BEFORE this one on every page.

  Never uses innerHTML with raw participant text — all text is inserted
  via textContent so names/messages can never inject HTML or scripts.
*/

(function () {
  const DATA = (typeof PARTICIPANTS !== "undefined" && Array.isArray(PARTICIPANTS)) ? PARTICIPANTS : [];
  const PAGE_SIZE = 12;

  function getCount() {
    return DATA.length;
  }

  // Fill every element with [data-vx-participant-count] on the page
  // (used by the small access card on every page, and the hero counter)
  function renderCounts() {
    const count = getCount();
    document.querySelectorAll("[data-vx-participant-count]").forEach(function (el) {
      el.textContent = String(count);
    });
  }

  function escapeText(str) {
    // textContent-based rendering already prevents HTML injection, but we
    // also normalize/strip here in case a value is ever used elsewhere.
    return String(str == null ? "" : str);
  }

  function buildCard(entry) {
    const card = document.createElement("div");
    card.className = "wall-card";

    const top = document.createElement("div");
    top.className = "wc-top";

    const name = document.createElement("span");
    name.className = "wc-name";
    name.textContent = escapeText(entry.name);

    const age = document.createElement("span");
    age.className = "wc-age";
    age.textContent = "Age " + escapeText(entry.age);

    top.appendChild(name);
    top.appendChild(age);

    const msg = document.createElement("p");
    msg.className = "wc-message";
    msg.textContent = escapeText(entry.message);

    card.appendChild(top);
    card.appendChild(msg);
    return card;
  }

  function renderWall() {
    const wallEl = document.getElementById("participantsWall");
    if (!wallEl) return; // page has no wall section (e.g. small access card only)

    wallEl.innerHTML = ""; // safe: we only ever clear here, all content below is created via createElement + textContent

    if (DATA.length === 0) {
      const empty = document.createElement("div");
      empty.className = "wall-empty";
      empty.textContent = "No entries published yet — be the first to take the challenge!";
      wallEl.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "wall-grid";
    wallEl.appendChild(grid);

    let shown = 0;
    const ordered = DATA.slice().reverse(); // newest-added entries first

    function renderNextPage() {
      const next = ordered.slice(shown, shown + PAGE_SIZE);
      next.forEach(function (entry) {
        grid.appendChild(buildCard(entry));
      });
      shown += next.length;

      const existingBtn = wallEl.querySelector(".wall-loadmore");
      if (existingBtn) existingBtn.remove();

      if (shown < ordered.length) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wall-loadmore";
        btn.textContent = "Load more";
        btn.addEventListener("click", renderNextPage);
        wallEl.appendChild(btn);
      }
    }

    renderNextPage();
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderCounts();
    renderWall();
  });
})();
