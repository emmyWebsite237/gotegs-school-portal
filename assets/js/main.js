// ==========================================================================
// Go-Tegs International School — shared site JS
// Injects the navbar/footer partials into every page and wires up
// small interactive bits (mobile menu, active link highlight, footer year).
// Also auto-loads the lesson-notes scripts on any page that needs them,
// so individual lesson-notes/admin-notes pages never need to be edited.
// ==========================================================================

// ==========================================================================
// Admin access gate
// --------------------------------------------------------------------------
// Admin credentials are verified server-side through /api/admin-verify.
// No admin password or service-role credential is embedded in the browser.
// The API uses the Supabase project configured in the deployment environment.
// ==========================================================================

// Hide the page immediately (before it renders) if this is an admin page
// and the gate hasn't been passed yet this session — avoids a flash of
// real content before the password prompt appears.
if (isAdminPathCheck(window.location.pathname) && sessionStorage.getItem("gotegs_admin_authed") !== "true") {
  document.documentElement.style.visibility = "hidden";
}

// ==========================================================================
// Student session guard — protects lesson-notes, quiz, result, and
// testimonial pages. Unlike the admin gate, this can't use a shared
// password: it requires a real Student ID + PIN check (done at login,
// see student/index.html), so an invalid/expired session just redirects
// to the login page rather than showing an inline prompt.
//
// Session lives in localStorage (survives closing the tab) but expires
// after 5 hours of inactivity — every guarded page view "touches" it
// and resets the countdown, matching "5 hours of inactivity" rather
// than "5 hours since login".
// ==========================================================================

const STUDENT_SESSION_KEY = "gotegs_student_session";
const STUDENT_SESSION_MAX_AGE_MS = 5 * 60 * 60 * 1000;

const STUDENT_PROTECTED_PREFIXES = [
  "/lesson-notes/",
  "/quiz.html",
  "/quiz-code.html",
  "/student/dashboard.html",
  "/student/profile.html",
  "/student/lesson-notes/",
  "/student/result/",
  "/student/testimonial/",
];

// The private portal uses its own shell, so public navigation is never shown
// inside an authenticated student workspace. This class is added immediately
// so desktop body padding from the public sidebar cannot flash first.
if (isStudentProtectedPath(window.location.pathname)) {
  document.documentElement.classList.add("student-portal-page");
  document.body && document.body.classList.add("student-shell-page");
}

function ensurePortalStylesheet() {
  if (document.querySelector('link[href="/assets/css/portal.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/assets/css/portal.css";
  document.head.appendChild(link);
}

function isStudentProtectedPath(pathname) {
  if (pathname === "/student/index.html" || pathname === "/student/") return false;
  return STUDENT_PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function getValidStudentSession() {
  const raw = localStorage.getItem(STUDENT_SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    if (!session.lastActivity || Date.now() - session.lastActivity > STUDENT_SESSION_MAX_AGE_MS) {
      localStorage.removeItem(STUDENT_SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    return null;
  }
}

function touchStudentSession(session) {
  session.lastActivity = Date.now();
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
}

// Runs immediately (before paint) — redirects instantly if this page
// needs a student login and there isn't a valid one.
(function enforceStudentGate() {
  const path = window.location.pathname;
  if (!isStudentProtectedPath(path)) return;

  const session = getValidStudentSession();
  if (!session) {
    document.documentElement.style.visibility = "hidden";
    window.location.href = "/student/index.html";
  } else {
    touchStudentSession(session);
  }
})();

// ==========================================================================

function isAdminPathCheck(pathname) {
  // Catches "/admin", "/admin/", and everything under "/admin/..." —
  // the bare "/admin" (no trailing slash) was previously slipping through.
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminPage() {
  return isAdminPathCheck(window.location.pathname);
}

function showAdminGate() {
  const overlay = document.createElement("div");
  overlay.id = "adminGateOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "adminGateTitle");
  overlay.setAttribute("aria-describedby", "adminGateDescription");
  overlay.style.cssText = `
    position: fixed; inset: 0; background: radial-gradient(circle at 50% 0%, #65181b 0%, #3f0a0d 42%, #210507 100%);
    z-index: 9999; visibility: visible; display: flex; align-items: center; justify-content: center;
    padding: 1.25rem; box-sizing: border-box;
  `;
  overlay.innerHTML = `
    <div style="width:100%; max-width:400px; background:#fff; border:1px solid rgba(255,255,255,.2); border-radius:18px; padding:1.75rem; box-sizing:border-box; box-shadow:0 24px 80px rgba(0,0,0,.35); font-family:sans-serif;">
      <div style="display:flex; align-items:center; gap:.8rem; margin-bottom:1rem;">
        <div style="width:44px; height:44px; border-radius:13px; background:linear-gradient(145deg,#7b1418,#3f0a0d); color:#fff; display:grid; place-items:center; font-size:1.1rem; font-weight:800;">GT</div>
        <div>
          <h2 id="adminGateTitle" style="margin:0; font-size:1.2rem; color:#1c1614;">Admin Access</h2>
          <p id="adminGateDescription" style="margin:.2rem 0 0; color:#6b5f5a; font-size:.88rem;">Use your saved admin password or PIN.</p>
        </div>
      </div>
      <form id="adminGateForm" novalidate>
        <label for="adminGateInput" style="display:block; color:#3d3430; font-size:.84rem; font-weight:700; margin-bottom:.4rem;">Password / PIN</label>
        <div style="position:relative;">
          <input type="password" id="adminGateInput" autocomplete="current-password" inputmode="text" aria-describedby="adminGateMsg" required
            style="width:100%; padding:.78rem 3.4rem .78rem .8rem; border:1px solid #d9d0c8; border-radius:10px; box-sizing:border-box; font-size:.96rem; outline:none;" />
          <button type="button" id="adminGateToggle" aria-label="Show password" aria-pressed="false"
            style="position:absolute; right:.4rem; top:50%; transform:translateY(-50%); border:0; background:transparent; color:#6b5f5a; padding:.45rem; cursor:pointer; font-weight:700;">Show</button>
        </div>
        <button type="submit" id="adminGateBtn"
          style="width:100%; margin-top:.9rem; padding:.78rem; border:0; border-radius:10px; background:#7b1418; color:#fff; font-weight:700; cursor:pointer;">Enter Admin</button>
        <p id="adminGateMsg" role="status" aria-live="polite" style="color:#dc2626; font-size:.84rem; margin:.65rem 0 0; min-height:1.15rem;"></p>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = document.getElementById("adminGateForm");
  const input = document.getElementById("adminGateInput");
  const toggle = document.getElementById("adminGateToggle");
  const button = document.getElementById("adminGateBtn");
  const msg = document.getElementById("adminGateMsg");

  let submitting = false;

  toggle.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    toggle.textContent = showing ? "Show" : "Hide";
    toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    toggle.setAttribute("aria-pressed", String(!showing));
  });

  async function attempt(event) {
    event.preventDefault();
    if (submitting) return;

    const pin = input.value;
    if (!pin) {
      msg.textContent = "Enter your password or PIN.";
      input.focus();
      return;
    }

    submitting = true;
    button.disabled = true;
    button.textContent = "Checking…";
    msg.textContent = "";

    try {
      const res = await fetch("/api/admin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ pin })
      });

      let data = {};
      try { data = await res.json(); } catch (_) {}

      if (!res.ok || data.success !== true) {
        msg.textContent = data.error || "Access denied.";
        input.value = "";
        input.focus();
        return;
      }

      sessionStorage.setItem("gotegs_admin_authed", "true");
      overlay.remove();
      document.documentElement.style.visibility = "visible";
      initShell();
    } catch (error) {
      console.error("Admin authentication error:", error);
      msg.textContent = "Admin authentication is unavailable right now.";
    } finally {
      submitting = false;
      button.disabled = false;
      button.textContent = "Enter Admin";
    }
  }

  form.addEventListener("submit", attempt);
  requestAnimationFrame(() => input.focus());
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
  const drawer = document.getElementById("nav-drawer");
  const scrim = document.getElementById("nav-scrim");
  const closeBtn = document.getElementById("nav-drawer-close");
  if (!toggle || !drawer || !scrim) return;

  function setDrawer(open) {
    drawer.classList.toggle("open", open);
    scrim.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  }

  toggle.addEventListener("click", () => setDrawer(!drawer.classList.contains("open")));
  scrim.addEventListener("click", () => setDrawer(false));
  if (closeBtn) closeBtn.addEventListener("click", () => setDrawer(false));

  // Close the drawer when any link inside it is tapped
  drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setDrawer(false)));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) setDrawer(false);
  });
}

// Collapsible nav groups (sidebar + drawer). A group auto-opens when one
// of its own links is the active page.
function wireNavGroups() {
  document.querySelectorAll(".nav-group").forEach((group) => {
    const btn = group.querySelector(".nav-group-toggle");
    if (!btn) return;

    if (group.querySelector("a.active")) {
      group.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", () => {
      const isOpen = group.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(isOpen));
    });
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

function initStudentPortalShell() {
  const session = getValidStudentSession();
  if (!session) return;

  const name = String(session.full_name || "Student");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "GT";
  const classLine = `${session.class || "Student"}${session.dept ? " · " + session.dept : ""}`;

  document.querySelectorAll("[data-portal-name]").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll("[data-portal-class]").forEach((el) => {
    el.textContent = classLine;
  });
  document.querySelectorAll("[data-portal-initials]").forEach((el) => {
    el.textContent = initials;
  });

  const path = window.location.pathname;
  let activeKey = "";
  if (path === "/student/dashboard.html" || path === "/student/" || path === "/student/index.html") activeKey = "dashboard";
  else if (path === "/student/profile.html") activeKey = "profile";
  else if (path.startsWith("/student/lesson-notes/")) activeKey = "notes";
  else if (path === "/quiz.html") activeKey = "quiz";
  else if (path === "/quiz-code.html") activeKey = "quiz-code";

  document.querySelectorAll("[data-portal-link]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.portalLink === activeKey);
  });

  function logout() {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    window.location.href = "/student/index.html";
  }

  document.querySelectorAll("#portalLogout, #portalLogoutMobile").forEach((button) => {
    button.addEventListener("click", logout);
  });

  const toggle = document.getElementById("portalMobileToggle");
  const drawer = document.getElementById("portalMobileDrawer");
  const scrim = document.getElementById("portalMobileScrim");
  const close = document.getElementById("portalMobileClose");
  if (toggle && drawer && scrim) {
    const setOpen = (open) => {
      drawer.classList.toggle("open", open);
      scrim.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    };
    toggle.addEventListener("click", () => setOpen(!drawer.classList.contains("open")));
    scrim.addEventListener("click", () => setOpen(false));
    if (close) close.addEventListener("click", () => setOpen(false));
    drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }
}

function initPortalPointer() {
  if (window.matchMedia("(pointer: fine)").matches === false) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (document.querySelector(".portal-pointer")) return;

  const dot = document.createElement("div");
  const ring = document.createElement("div");
  dot.className = "portal-pointer";
  ring.className = "portal-pointer-ring";
  document.body.append(dot, ring);
  document.body.classList.add("portal-pointer-enabled");

  let tx = 0, ty = 0, rx = 0, ry = 0;
  let raf = 0;
  const render = () => {
    rx += (tx - rx) * 0.2;
    ry += (ty - ry) * 0.2;
    dot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    raf = requestAnimationFrame(render);
  };
  raf = requestAnimationFrame(render);

  document.addEventListener("pointermove", (e) => {
    tx = e.clientX;
    ty = e.clientY;
    dot.classList.add("is-visible");
    ring.classList.add("is-visible");
  }, { passive: true });
  document.addEventListener("pointerleave", () => {
    dot.classList.remove("is-visible");
    ring.classList.remove("is-visible");
  });

  document.addEventListener("pointerover", (e) => {
    const target = e.target instanceof Element ? e.target.closest("a, button, [data-portal-interactive], .portal-card") : null;
    if (target) { dot.classList.add("is-active"); ring.classList.add("is-active"); }
  });
  document.addEventListener("pointerout", (e) => {
    const target = e.target instanceof Element ? e.target.closest("a, button, [data-portal-interactive], .portal-card") : null;
    if (target) { dot.classList.remove("is-active"); ring.classList.remove("is-active"); }
  });

  window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
}

function initPortalTilt() {
  if (window.matchMedia("(pointer: fine)").matches === false) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelectorAll("[data-tilt-card]").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg) translateY(-5px)`;
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
}

async function initShell() {
  const studentPage = isStudentProtectedPath(window.location.pathname);

  if (studentPage) {
    ensurePortalStylesheet();
    document.body.classList.add("student-shell-page");
    await injectPartial("/partials/student-shell.html", "navbar-placeholder");
    initStudentPortalShell();
    initPortalPointer();
    initPortalTilt();
  } else {
    await injectPartial("/partials/navbar.html", "navbar-placeholder");
    await injectPartial("/partials/footer.html", "footer-placeholder");

    highlightActiveLink();
    wireNavGroups();
    wireMobileToggle();
    setFooterYear();
    loadSocialIconsIfNeeded();
  }

  await loadNotesScriptsIfNeeded();
}

async function loadSocialIconsIfNeeded() {
  if (!document.getElementById("footer-social")) return;
  try {
    await loadScript("/assets/js/social-links.js");
    if (window.__gotegsLoadSocialIcons) window.__gotegsLoadSocialIcons();
  } catch (err) {
    console.error("Failed to load social-links.js:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (adminGatePassedOrNotNeeded()) {
    initShell();
  } else {
    showAdminGate();
  }

  setupAdminInactivityTimeout();
});

// ==========================================================================
// Admin inactivity timeout — 3 minutes. Clock starts the moment the tab
// loses focus (switched away, minimized, or another window/app takes
// focus); if more than 3 minutes pass before returning, both the site-wide
// admin gate and the admin-records login are cleared, forcing re-entry.
// ==========================================================================

function setupAdminInactivityTimeout() {
  if (!isAdminPage()) return;

  const TIMEOUT_MS = 3 * 60 * 1000;
  let hiddenAt = null;

  function markHidden() {
    if (hiddenAt === null) hiddenAt = Date.now();
  }

  function checkReturn() {
    if (hiddenAt === null) return;
    const elapsed = Date.now() - hiddenAt;
    hiddenAt = null;

    if (elapsed >= TIMEOUT_MS) {
      sessionStorage.removeItem("gotegs_admin_authed");
      sessionStorage.removeItem("gotegs_records_authed");
      window.location.reload();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) markHidden();
    else checkReturn();
  });

  window.addEventListener("blur", markHidden);
  window.addEventListener("focus", checkReturn);
}
