// ==========================================================================
// Go-Tegs International School — shared site JS
// Injects the navbar/footer partials into every page and wires up
// small interactive bits (mobile menu, active link highlight, footer year).
// Also auto-loads the lesson-notes scripts on any page that needs them,
// so individual lesson-notes/admin-notes pages never need to be edited.
// ==========================================================================

// ==========================================================================
// Admin authentication
// The admin password is verified server-side against the admin_portal table.
// The browser stores only a short-lived signed session token.
// ==========================================================================

const ADMIN_AUTH_KEY = "gotegs_admin_authed";
const ADMIN_TOKEN_KEY = "gotegs_admin_token";
const ADMIN_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

if (isAdminPathCheck(window.location.pathname)) {
  document.documentElement.classList.add("admin-page-mode");
}

if (isAdminPathCheck(window.location.pathname) && !hasAdminAuthSession()) {
  document.documentElement.style.visibility = "hidden";
}

function getAdminTokenPayload(token) {
  try {
    const raw = String(token || "").split(".")[0];
    if (!raw) return null;
    return JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4)));
  } catch {
    return null;
  }
}

function hasAdminAuthSession() {
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) !== "true") return false;
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) return false;
  const payload = getAdminTokenPayload(token);
  const expiresAt = Number(payload?.exp || 0) * 1000;
  if (!expiresAt || Date.now() >= expiresAt) {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem("gotegs_records_authed");
    return false;
  }
  return true;
}

function scheduleAdminExpiry() {
  if (!isAdminPage()) return;
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const payload = getAdminTokenPayload(token);
  const expiresAt = Number(payload?.exp || 0) * 1000;
  if (!expiresAt) return;
  const delay = Math.max(0, expiresAt - Date.now());
  window.setTimeout(() => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem("gotegs_records_authed");
    window.location.reload();
  }, delay);
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
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminPage() {
  return isAdminPathCheck(window.location.pathname);
}

function showAdminGate() {
  const overlay = document.createElement("div");
  overlay.id = "adminGateOverlay";
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background:
      radial-gradient(circle at 50% 0%, rgba(77, 169, 255, .34) 0%, transparent 38%),
      linear-gradient(135deg, #0b63ce 0%, #0c479c 48%, #051f4d 100%);
    z-index: 9999; visibility: visible;
    display: flex; align-items: center; justify-content: center; padding: 1rem; box-sizing: border-box;
  `;
  overlay.innerHTML = `
    <div style="background:rgba(255,255,255,.98); padding:2rem; border-radius:18px; width:100%; max-width:360px; text-align:center; font-family:sans-serif; box-shadow:0 24px 80px rgba(0,0,0,.3);">
      <h2 style="margin:0 0 .6rem; font-size:1.2rem; color:#1c1614;">Admin Access</h2>
      <p style="color:#6b5f5a; font-size:.9rem; margin-bottom:1rem;">Enter the admin password to continue.</p>
      <label for="adminGateInput" style="position:absolute;left:-9999px;">Admin password</label>
      <input type="password" id="adminGateInput" autocomplete="current-password" aria-describedby="adminGateMsg" style="width:100%; padding:.75rem; border:1px solid #e8dfcf; border-radius:9px; margin-bottom:.75rem; box-sizing:border-box;" />
      <button id="adminGateBtn" type="button" style="width:100%; padding:.75rem; border:none; border-radius:9px; background:linear-gradient(135deg,#0b63ce,#083b8d); color:#fff; font-weight:700; cursor:pointer;">Enter</button>
      <p id="adminGateMsg" role="status" aria-live="polite" style="color:#dc2626; font-size:.85rem; margin-top:.6rem; min-height:1.1rem;"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById("adminGateInput");
  const button = document.getElementById("adminGateBtn");
  const msg = document.getElementById("adminGateMsg");

  async function attempt() {
    const password = input.value;
    if (!password) {
      msg.textContent = "Enter the admin password.";
      input.focus();
      return;
    }

    button.disabled = true;
    button.textContent = "Checking…";
    msg.textContent = "";

    try {
      const res = await fetch("/api/admin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.token) {
        msg.textContent = data.error || "Incorrect password.";
        input.value = "";
        button.disabled = false;
        button.textContent = "Enter";
        input.focus();
        return;
      }

      sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      scheduleAdminExpiry();
      overlay.remove();
      document.documentElement.style.visibility = "visible";
      document.dispatchEvent(new CustomEvent("gotegs:admin-authenticated"));
      initShell();
    } catch (err) {
      msg.textContent = "Connection error. Please try again.";
      button.disabled = false;
      button.textContent = "Enter";
    }
  }

  button.addEventListener("click", attempt);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  input.focus();
}

function adminGatePassedOrNotNeeded() {
  if (!isAdminPage()) return true;
  return hasAdminAuthSession();
}

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
  else if (path.startsWith("/student/result/")) activeKey = "results";
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

function initAdminWorkspaceControls() {
  if (!isAdminPage() || document.getElementById('gotegsAdminLogout')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'gotegsAdminLogout';
  button.textContent = 'Log out';
  button.setAttribute('aria-label', 'Log out of admin portal');
  button.style.cssText = 'position:fixed;top:18px;right:18px;z-index:9000;border:1px solid #c8d7e5;border-radius:999px;padding:.62rem 1rem;background:#eef6ff;color:#0c4f8d;font:800 .74rem var(--font-display,system-ui);cursor:pointer;box-shadow:0 8px 24px rgba(7,47,88,.12);';
  button.addEventListener('mouseenter', () => { button.style.background = '#dfefff'; });
  button.addEventListener('mouseleave', () => { button.style.background = '#eef6ff'; });
  button.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem('gotegs_records_authed');
    window.location.href = '/admin/';
  });
  document.body.appendChild(button);
}

async function initShell() {
  const adminPage = isAdminPage();
  const studentPage = isStudentProtectedPath(window.location.pathname);

  if (adminPage) {
    document.body.classList.add("admin-shell-page");
    initAdminWorkspaceControls();
  } else if (studentPage) {
    ensurePortalStylesheet();
    document.body.classList.add("student-shell-page");
    await injectPartial("/partials/student-shell.html", "navbar-placeholder");
    initStudentPortalShell();
    initPortalPointer();
    initPortalTilt();
  } else if (!adminPage) {
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
    if (isAdminPage()) scheduleAdminExpiry();
    initShell();
    if (isAdminPage()) document.dispatchEvent(new CustomEvent("gotegs:admin-authenticated"));
  } else {
    showAdminGate();
  }

  setupAdminInactivityTimeout();
});

// ==========================================================================
// Admin inactivity timeout — 30 minutes. Clock starts the moment the tab
// loses focus (switched away, minimized, or another window/app takes
// focus); if more than 30 minutes pass before returning, both the site-wide
// admin gate and the admin-records login are cleared, forcing re-entry.
// ==========================================================================

function setupAdminInactivityTimeout() {
  if (!isAdminPage()) return;

  const TIMEOUT_MS = 30 * 60 * 1000;
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
      sessionStorage.removeItem("gotegs_admin_token");
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
