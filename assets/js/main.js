// ==========================================================================
// Go-Tegs International School — shared site JS
// Injects the navbar/footer partials into every page and wires up
// small interactive bits (mobile menu, active link highlight, footer year).
// Also auto-loads the lesson-notes scripts on any page that needs them,
// so individual lesson-notes/admin-notes pages never need to be edited.
// ==========================================================================

// ==========================================================================
// Admin password gate — deterrent only, not real security (the password
// lives in this file, visible to anyone who inspects the page source).
// Blocks casual visitors from opening /admin/ pages without a password;
// stays unlocked for the rest of the browser session once entered.
// ==========================================================================

// Hide the page immediately (before it renders) if this is an admin page
// and the gate hasn't been passed yet this session — avoids a flash of
// real content before the password prompt appears.
if (window.location.pathname.startsWith("/admin/") && sessionStorage.getItem("gotegs_admin_authed") !== "true") {
  document.documentElement.style.visibility = "hidden";
}

const ADMIN_GATE_PASSWORD = "qwer12ty";

function isAdminPage() {
  return window.location.pathname.startsWith("/admin/");
}

function showAdminGate() {
  const overlay = document.createElement("div");
  overlay.id = "adminGateOverlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: #16231f; z-index: 9999; visibility: visible;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background:#fff; padding:2rem; border-radius:12px; width:100%; max-width:340px; text-align:center; font-family: sans-serif;">
      <h2 style="margin:0 0 0.75rem; font-size:1.2rem; color:#16231f;">Admin Access</h2>
      <p style="color:#5c6b68; font-size:0.9rem; margin-bottom:1rem;">Enter the password to continue.</p>
      <input type="password" id="adminGateInput" style="width:100%; padding:0.7rem; border:1px solid #e3ece9; border-radius:8px; margin-bottom:0.75rem; box-sizing:border-box;" />
      <button id="adminGateBtn" style="width:100%; padding:0.7rem; border:none; border-radius:8px; background:#3fb0aa; color:#fff; font-weight:600; cursor:pointer;">Enter</button>
      <p id="adminGateMsg" style="color:#dc2626; font-size:0.85rem; margin-top:0.6rem; min-height:1.1rem;"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById("adminGateInput");
  const msg = document.getElementById("adminGateMsg");

  function attempt() {
    if (input.value === ADMIN_GATE_PASSWORD) {
      sessionStorage.setItem("gotegs_admin_authed", "true");
      overlay.remove();
      document.documentElement.style.visibility = "visible"; // reveal the real page now
      initShell();
    } else {
      msg.textContent = "Incorrect password.";
      input.value = "";
    }
  }

  document.getElementById("adminGateBtn").addEventListener("click", attempt);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attempt();
  });
  input.focus();
}

function adminGatePassedOrNotNeeded() {
  if (!isAdminPage()) return true;
  return sessionStorage.getItem("gotegs_admin_authed") === "true";
}

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

document.addEventListener("DOMContentLoaded", () => {
  if (adminGatePassedOrNotNeeded()) {
    initShell();
  } else {
    showAdminGate();
  }
});
