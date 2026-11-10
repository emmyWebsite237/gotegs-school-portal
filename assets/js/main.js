// Go-Tegs shared client runtime: private admin gate, private student shell,
// public shell loading, lesson-note bootstrapping and graphical interactions.

const ADMIN_AUTH_KEY = 'gotegs_admin_authed';
const ADMIN_TOKEN_KEY = 'gotegs_admin_token';
const ADMIN_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const STUDENT_SESSION_KEY = 'gotegs_student_session';
const STUDENT_SESSION_MAX_AGE_MS = 5 * 60 * 60 * 1000;

const STUDENT_PROTECTED_PREFIXES = [
  '/student/dashboard.html',
  '/student/profile.html',
  '/student/result/',
  '/student/lesson-notes/',
  '/student/quiz/',
  '/student/quiz-code/',
  '/student/store/',
  '/student/testimonial/',
  '/quiz.html',
  '/quiz-code.html'
];

function isAdminPathCheck(pathname){
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isAdminPage(){
  return isAdminPathCheck(window.location.pathname);
}

function isStudentProtectedPath(pathname){
  const clean = pathname.replace(/\/+$/, '');
  if (clean === '/student' || clean === '/student/index.html' || clean === '') return false;
  return STUDENT_PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p));
}

function getAdminTokenPayload(token){
  try{
    const raw = String(token || '').split('.')[0];
    if(!raw) return null;
    return JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((raw.length+3)%4)));
  }catch{
    return null;
  }
}

function hasAdminAuthSession(){
  if(sessionStorage.getItem(ADMIN_AUTH_KEY) !== 'true') return false;
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if(!token) return false;
  const p = getAdminTokenPayload(token);
  if(!p?.exp || Date.now() >= Number(p.exp) * 1000){
    clearAdminSession();
    return false;
  }
  return true;
}

function clearAdminSession(){
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem('gotegs_records_authed');
}

function getValidStudentSession(){
  const raw = localStorage.getItem(STUDENT_SESSION_KEY);
  if(!raw) return null;
  try{
    const s = JSON.parse(raw);
    if(!s.lastActivity || (Date.now() - s.lastActivity) > STUDENT_SESSION_MAX_AGE_MS){
      localStorage.removeItem(STUDENT_SESSION_KEY);
      return null;
    }
    return s;
  }catch{
    localStorage.removeItem(STUDENT_SESSION_KEY);
    return null;
  }
}

function touchStudentSession(s){
  s.lastActivity = Date.now();
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(s));
}

// Always ensure document is visible
document.documentElement.style.visibility = 'visible';

if (isAdminPathCheck(window.location.pathname)){
  document.documentElement.classList.add('admin-page-mode');
}

if (isStudentProtectedPath(window.location.pathname)){
  document.documentElement.classList.add('student-portal-page');
  if (!getValidStudentSession()){
    window.location.replace('/student/index.html');
  }
}

function scheduleAdminExpiry(){
  if(!isAdminPage()) return;
  const p = getAdminTokenPayload(sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const expiresAt = Number(p?.exp || 0) * 1000;
  if(!expiresAt) return;
  window.setTimeout(()=>{
    clearAdminSession();
    window.location.reload();
  }, Math.max(0, expiresAt - Date.now()));
}

function showAdminGate(){
  if(document.getElementById('adminGateOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'adminGateOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;background:radial-gradient(circle at 20% 20%,rgba(37,99,235,.28),transparent 32%),linear-gradient(135deg,#0f172a 0%,#1e293b 52%,#3b82f6 145%);';
  overlay.innerHTML = '<div style="width:min(420px,100%);padding:2rem;border-radius:24px;background:#ffffff;box-shadow:0 30px 90px rgba(0,0,0,.35);text-align:center;font-family:system-ui,-apple-system,sans-serif"><div style="font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#2563eb">Go-Tegs Administration</div><h2 style="margin:.5rem 0 .5rem;color:#0f172a">Private Admin Access</h2><p style="margin:0 0 1.25rem;color:#64748b;font-size:.88rem">Enter your administrator password to continue.</p><label for="adminGateInput" style="position:absolute;left:-9999px">Admin password</label><input id="adminGateInput" type="password" autocomplete="current-password" placeholder="Password" style="width:100%;box-sizing:border-box;padding:.85rem 1rem;border:1px solid #cbd5e1;border-radius:12px;font-size:1rem"/><button id="adminGateBtn" type="button" style="width:100%;margin-top:.85rem;padding:.85rem;border:0;border-radius:12px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:700;cursor:pointer;font-size:.95rem">Enter Admin Portal</button><p id="adminGateMsg" role="status" aria-live="polite" style="min-height:1.2rem;margin:.75rem 0 0;color:#ef4444;font-size:.82rem;font-weight:700"></p></div>';
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#adminGateInput');
  const button = overlay.querySelector('#adminGateBtn');
  const msg = overlay.querySelector('#adminGateMsg');
  async function attempt(){
    const password = input.value;
    if(!password){ msg.textContent='Enter the admin password.'; input.focus(); return; }
    button.disabled = true; button.textContent='Checking…'; msg.textContent='';
    try{
      const r = await fetch('/api/admin-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const d = await r.json().catch(()=>({}));
      if(!r.ok || !d.token) throw new Error(d.error||'Incorrect password.');
      sessionStorage.setItem(ADMIN_AUTH_KEY,'true');
      sessionStorage.setItem(ADMIN_TOKEN_KEY,d.token);
      overlay.remove();
      scheduleAdminExpiry();
      window.location.reload();
    }catch(err){
      msg.textContent = err.message || 'Could not verify access.';
      button.disabled = false; button.textContent = 'Enter Admin Portal';
      input.focus();
    }
  }
  button.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if(e.key==='Enter') attempt(); });
  input.focus();
}

function adminGatePassedOrNotNeeded(){
  return !isAdminPage() || hasAdminAuthSession();
}

function loadScript(src){
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

async function loadNotesScriptsIfNeeded(){
  const needsNotes = !!document.querySelector('.note-file, .notes-table, .admin-notes-table');
  if(!needsNotes) return;
  try {
    await loadScript('/assets/js/notes.js');
  } catch(err) {
    console.warn('Failed to load lesson notes script:', err);
  }
}

async function injectPartial(url, targetId){
  const target = document.getElementById(targetId);
  if(!target) return;
  try{
    const r = await fetch(url);
    if(!r.ok) throw new Error(`Failed to load ${url}`);
    target.innerHTML = await r.text();
  }catch(err){
    console.warn('Partial load error:', err);
  }
}

function highlightActiveLink(){
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a, .desktop-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if(!href) return;
    const home = href === '/index.html' && (path === '/' || path === '/index.html');
    const section = href !== '/index.html' && path.startsWith(href.replace('index.html',''));
    if(home || section) link.classList.add('active');
  });
}

function bindFadeMobileMenu({toggleId,drawerId,scrimId,closeId,label}={}){
  const toggle = document.getElementById(toggleId);
  const drawer = document.getElementById(drawerId);
  const scrim = document.getElementById(scrimId);
  const close = document.getElementById(closeId);
  if(!toggle || !drawer) return false;
  if(toggle.dataset.navBound === '1') return true;
  toggle.dataset.navBound = '1';

  const setOpen = open => {
    const isOpen = !!open;
    drawer.classList.toggle('open', isOpen);
    if(scrim) scrim.classList.toggle('open', isOpen);
    drawer.setAttribute('aria-hidden', String(!isOpen));
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? `Close ${label||'menu'}` : `Open ${label||'menu'}`);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  toggle.addEventListener('click', e => { e.preventDefault(); setOpen(!drawer.classList.contains('open')); });
  if(scrim) scrim.addEventListener('click', e => { e.preventDefault(); setOpen(false); });
  if(close) close.addEventListener('click', e => { e.preventDefault(); setOpen(false); });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  return true;
}

function wireMobileNavigation(){
  bindFadeMobileMenu({toggleId:'nav-toggle', drawerId:'nav-drawer', scrimId:'nav-scrim', closeId:'nav-drawer-close', label:'site menu'});
  bindFadeMobileMenu({toggleId:'portalMobileToggle', drawerId:'portalMobileDrawer', scrimId:'portalMobileScrim', closeId:'portalMobileClose', label:'student portal menu'});
}

function setFooterYear(){
  const el = document.getElementById('footer-year');
  if(el) el.textContent = new Date().getFullYear();
}

function studentInitials(name){
  return String(name || 'Student').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase() || 'GT';
}

function setPortalAvatar(img, initialsEl, session){
  const fallbackLogo = '/assets/img/logo.png';
  if(img){
    if(session.profile_pic_url){
      img.src = session.profile_pic_url;
      img.alt = `${session.full_name||'Student'} profile picture`;
    }else{
      img.src = fallbackLogo;
      img.alt = 'Go-Tegs logo';
    }
  }
  if(initialsEl) initialsEl.textContent = studentInitials(session.full_name);
}

function initStudentPortalShell(){
  const session = getValidStudentSession();
  if(!session) return;
  const name = String(session.full_name || 'Student');
  const classLine = `${session.class||'Student'}${session.dept ? ' · ' + session.dept : ''}`;
  document.querySelectorAll('[data-portal-name]').forEach(el => el.textContent = name);
  document.querySelectorAll('[data-portal-class]').forEach(el => el.textContent = classLine);
  document.querySelectorAll('[data-portal-initials]').forEach(el => el.textContent = studentInitials(name));
  document.querySelectorAll('[data-portal-profile-image],[data-profile-image]').forEach(img => {
    setPortalAvatar(img, img.closest('.portal-profile-avatar,.portal-orbit-core,.profile-avatar-xl')?.querySelector('[data-portal-initials]'), session);
  });

  const path = window.location.pathname;
  let activeKey = '';
  if(path === '/student/dashboard.html' || path === '/student/' || path === '/student/index.html') activeKey = 'dashboard';
  else if(path === '/student/profile.html') activeKey = 'profile';
  else if(path.startsWith('/student/result/')) activeKey = 'results';
  else if(path.startsWith('/student/lesson-notes/') || path.startsWith('/lesson-notes/')) activeKey = 'notes';
  else if(path.startsWith('/student/quiz/')) activeKey = 'quiz';
  else if(path.startsWith('/student/quiz-code/')) activeKey = 'quiz-code';
  else if(path.startsWith('/student/store/')) activeKey = 'store';

  document.querySelectorAll('[data-portal-link]').forEach(link => {
    link.classList.toggle('is-active', link.dataset.portalLink === activeKey);
  });

  document.querySelectorAll('#portalLogout,#portalLogoutMobile').forEach(button => {
    button.addEventListener('click', () => {
      localStorage.removeItem(STUDENT_SESSION_KEY);
      sessionStorage.removeItem('gotegs_result_data');
      window.location.replace('/student/index.html');
    });
  });

  wireMobileNavigation();
}

async function initShell(){
  document.documentElement.style.visibility = 'visible';
  const adminPage = isAdminPage();
  const studentPage = isStudentProtectedPath(window.location.pathname);

  if(adminPage){
    document.body.classList.add('admin-shell-page');
    scheduleAdminExpiry();
    await loadNotesScriptsIfNeeded();
  } else if(studentPage){
    const session = getValidStudentSession();
    if(session) touchStudentSession(session);
    document.body.classList.add('student-shell-page');
    await injectPartial('/partials/student-shell.html', 'navbar-placeholder');
    initStudentPortalShell();
    await loadNotesScriptsIfNeeded();
  } else {
    await injectPartial('/partials/navbar.html', 'navbar-placeholder');
    await injectPartial('/partials/footer.html', 'footer-placeholder');
    highlightActiveLink();
    wireMobileNavigation();
    setFooterYear();
    await loadNotesScriptsIfNeeded();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.visibility = 'visible';
  if(adminGatePassedOrNotNeeded()){
    initShell();
    if(isAdminPage()) document.dispatchEvent(new CustomEvent('gotegs:admin-authenticated'));
  }else{
    showAdminGate();
  }
});

window.addEventListener('pageshow', () => {
  document.documentElement.style.visibility = 'visible';
  if(isStudentProtectedPath(window.location.pathname) && !getValidStudentSession()){
    window.location.replace('/student/index.html');
  }
});
