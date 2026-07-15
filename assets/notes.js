// ==========================================================================
// Go-Tegs International School — shared site JS
// Injects the navbar/footer partials into every page and wires up
// small interactive bits (mobile menu, active link highlight, footer year).
// Also auto-loads the lesson-notes scripts on any page that needs them,
// so individual lesson-notes/admin-notes pages never need to be edited.
// ==========================================================================

async function injectPartial(url, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    target.innerHTML = await res.text();
  } catch (err) {
    console.error("Partial load error:", err);
  }
}

function highlightActiveLink() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    const isHome = href === "/index.html" && (path === "/" || path === "/index.html");
    const isSection = href !== "/index.html" && path.startsWith(href.replace("index.html", ""));

    if (isHome || isSection) {
      link.classList.add("active");
    }
  });
}

function wireMobileToggle() {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function setFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = new Date().getFullYear();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function loadNotesScriptsIfNeeded() {
  const needsNotes = document.querySelector(".note-file") || document.querySelector(".admin-notes-table");
  if (!needsNotes) return;

  try {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    await loadScript("/assets/js/supabase-config.js");
    await loadScript("/assets/js/notes.js");
  } catch (err) {
    console.error("Failed to load lesson notes scripts:", err);
  }
}

async function initShell() {
  await injectPartial("/partials/navbar.html", "navbar-placeholder");
  await injectPartial("/partials/footer.html", "footer-placeholder");

  highlightActiveLink();
  wireMobileToggle();
  setFooterYear();

  await loadNotesScriptsIfNeeded();
}

document.addEventListener("DOMContentLoaded", initShell);
