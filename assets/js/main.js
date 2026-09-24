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
  '/lesson-notes/',
  '/quiz.html',
  '/quiz-code.html'
];

function isAdminPathCheck(pathname){return pathname==='/admin'||pathname.startsWith('/admin/');}
function isAdminPage(){return isAdminPathCheck(window.location.pathname);}
function isStudentProtectedPath(pathname){if(pathname==='/student/index.html'||pathname==='/student/')return false;return STUDENT_PROTECTED_PREFIXES.some(p=>pathname===p||pathname.startsWith(p));}
function getAdminTokenPayload(token){try{const raw=String(token||'').split('.')[0];if(!raw)return null;return JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((raw.length+3)%4)));}catch{return null;}}
function hasAdminAuthSession(){if(sessionStorage.getItem(ADMIN_AUTH_KEY)!=='true')return false;const token=sessionStorage.getItem(ADMIN_TOKEN_KEY);if(!token)return false;const p=getAdminTokenPayload(token);if(!p?.exp||Date.now()>=Number(p.exp)*1000){clearAdminSession();return false;}return true;}
function clearAdminSession(){sessionStorage.removeItem(ADMIN_AUTH_KEY);sessionStorage.removeItem(ADMIN_TOKEN_KEY);sessionStorage.removeItem('gotegs_records_authed');}
function getValidStudentSession(){const raw=localStorage.getItem(STUDENT_SESSION_KEY);if(!raw)return null;try{const s=JSON.parse(raw);if(!s.lastActivity||Date.now()-s.lastActivity>STUDENT_SESSION_MAX_AGE_MS){localStorage.removeItem(STUDENT_SESSION_KEY);return null;}return s;}catch{localStorage.removeItem(STUDENT_SESSION_KEY);return null;}}
function touchStudentSession(s){s.lastActivity=Date.now();localStorage.setItem(STUDENT_SESSION_KEY,JSON.stringify(s));}

if(isAdminPathCheck(window.location.pathname)){document.documentElement.classList.add('admin-page-mode');if(!hasAdminAuthSession())document.documentElement.style.visibility='hidden';}
if(isStudentProtectedPath(window.location.pathname))document.documentElement.classList.add('student-portal-page');
if(isStudentProtectedPath(window.location.pathname)&&!getValidStudentSession()){document.documentElement.style.visibility='hidden';window.location.href='/student/index.html';}

function scheduleAdminExpiry(){if(!isAdminPage())return;const p=getAdminTokenPayload(sessionStorage.getItem(ADMIN_TOKEN_KEY));const expiresAt=Number(p?.exp||0)*1000;if(!expiresAt)return;window.setTimeout(()=>{clearAdminSession();window.location.reload();},Math.max(0,expiresAt-Date.now()));}

function showAdminGate(){
  if(document.getElementById('adminGateOverlay'))return;
  const overlay=document.createElement('div');overlay.id='adminGateOverlay';overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;background:radial-gradient(circle at 20% 20%,rgba(224,185,92,.28),transparent 32%),linear-gradient(135deg,#2b111b 0%,#6d1f36 52%,#b4873e 145%);';
  overlay.innerHTML='<div style="width:min(420px,100%);padding:2rem;border-radius:28px;background:rgba(255,255,255,.97);box-shadow:0 30px 90px rgba(0,0,0,.28);text-align:center;font-family:system-ui,sans-serif"><div style="font-size:.68rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#7a2139">Go-Tegs Administration</div><h2 style="margin:.45rem 0 .55rem;color:#24191c">Private Admin Access</h2><p style="margin:0 0 1rem;color:#6e6668;font-size:.86rem">Enter your administrator password to continue.</p><label for="adminGateInput" style="position:absolute;left:-9999px">Admin password</label><input id="adminGateInput" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:.85rem 1rem;border:1px solid #ddd1cc;border-radius:12px;font-size:1rem"/><button id="adminGateBtn" type="button" style="width:100%;margin-top:.8rem;padding:.85rem;border:0;border-radius:12px;background:linear-gradient(135deg,#7a2139,#a84a60);color:#fff;font-weight:800;cursor:pointer">Enter Admin Portal</button><p id="adminGateMsg" role="status" aria-live="polite" style="min-height:1.2rem;margin:.7rem 0 0;color:#c53030;font-size:.8rem;font-weight:700"></p></div>';
  document.body.appendChild(overlay);document.documentElement.style.visibility='visible';
  const input=overlay.querySelector('#adminGateInput'),button=overlay.querySelector('#adminGateBtn'),msg=overlay.querySelector('#adminGateMsg');
  async function attempt(){const password=input.value;if(!password){msg.textContent='Enter the admin password.';input.focus();return;}button.disabled=true;button.textContent='Checking…';msg.textContent='';try{const r=await fetch('/api/admin-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error(d.error||'Incorrect password.');sessionStorage.setItem(ADMIN_AUTH_KEY,'true');sessionStorage.setItem(ADMIN_TOKEN_KEY,d.token);overlay.remove();scheduleAdminExpiry();window.location.reload();}catch(err){msg.textContent=err.message||'Could not verify access.';button.disabled=false;button.textContent='Enter Admin Portal';input.focus();}}
  button.addEventListener('click',attempt);input.addEventListener('keydown',e=>{if(e.key==='Enter')attempt();});input.focus();
}
function adminGatePassedOrNotNeeded(){return !isAdminPage()||hasAdminAuthSession();}

async function injectPartial(url,targetId){let target=document.getElementById(targetId);if(!target&&targetId==='navbar-placeholder'){target=document.createElement('div');target.id=targetId;document.body.prepend(target);}if(!target)return false;try{const r=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw new Error(`Failed to load ${url} (${r.status})`);const html=await r.text();if(!html.trim())throw new Error(`Empty partial response from ${url}`);target.innerHTML=html;return true;}catch(err){console.error('Partial load error:',err);return false;}}
function highlightActiveLink(){const path=window.location.pathname;document.querySelectorAll('.nav-links a').forEach(link=>{const href=link.getAttribute('href');if(!href)return;const home=href==='/index.html'&&(path==='/'||path==='/index.html');const section=href!=='/index.html'&&path.startsWith(href.replace('index.html',''));if(home||section)link.classList.add('active');});}
function wireMobileToggle(){const toggle=document.getElementById('nav-toggle'),links=document.getElementById('nav-links');if(!toggle||!links)return;toggle.addEventListener('click',()=>{const open=links.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});}
function wireNavGroups(){document.querySelectorAll('.nav-group').forEach(group=>{const btn=group.querySelector('.nav-group-toggle');if(!btn)return;if(group.querySelector('a.active')){group.classList.add('open');btn.setAttribute('aria-expanded','true');}btn.addEventListener('click',()=>{const open=group.classList.toggle('open');btn.setAttribute('aria-expanded',String(open));});});}
function setFooterYear(){const el=document.getElementById('footer-year');if(el)el.textContent=new Date().getFullYear();}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);});}
function ensurePortalStyles(){
  if(document.getElementById('gotegsPortalStyles')) return;
  const link=document.createElement('link');
  link.id='gotegsPortalStyles';
  link.rel='stylesheet';
  link.href='/assets/css/portal.css';
  document.head.appendChild(link);
}

const STUDENT_SHELL_FALLBACK="<!-- Private student portal shell: no public site navbar/footer inside the authenticated workspace. -->\n<aside class=\"portal-rail\" aria-label=\"Student portal navigation\">\n  <div class=\"portal-brand\"><a class=\"portal-brand-mark\" href=\"/student/dashboard.html\" aria-label=\"Go-Tegs student dashboard\"><img src=\"/assets/img/logo.png\" alt=\"Go-Tegs logo\" /></a><div class=\"portal-brand-copy\"><strong>Go-Tegs</strong><span>Student Portal</span></div></div>\n  <div class=\"portal-profile-mini\"><div class=\"portal-profile-avatar\"><img src=\"/assets/img/logo.png\" data-portal-profile-image alt=\"Go-Tegs logo\" /><span class=\"portal-profile-initials\" data-portal-initials aria-hidden=\"true\"></span></div><div><strong data-portal-name>Student</strong><span data-portal-class>Portal account</span></div></div>\n  <nav class=\"portal-nav\" aria-label=\"Student workspace\">\n    <span class=\"portal-nav-label\">Workspace</span>\n    <a class=\"portal-nav-link\" data-portal-link=\"dashboard\" href=\"/student/dashboard.html\"><span>\u2302</span>Dashboard</a>\n    <a class=\"portal-nav-link\" data-portal-link=\"profile\" href=\"/student/profile.html\"><span>\u25c9</span>Profile</a>\n    <a class=\"portal-nav-link\" data-portal-link=\"results\" href=\"/student/result/index.html\"><span>\u25a5</span>Results</a>\n    <a class=\"portal-nav-link\" data-portal-link=\"notes\" href=\"/student/lesson-notes/index.html\"><span>\u25a4</span>Lesson Notes</a>\n    <a class=\"portal-nav-link\" data-portal-link=\"quiz\" href=\"/student/quiz/\"><span>\u2726</span>Quiz &amp; Practice</a>\n    <a class=\"portal-nav-link\" data-portal-link=\"quiz-code\" href=\"/student/quiz-code/\"><span>\u2318</span>Quiz Code</a>\n    <a class=\"portal-nav-link\" data-portal-link=\"store\" href=\"/student/store/\"><span>\u25eb</span>Store</a>\n    \n    <span class=\"portal-nav-label portal-nav-label--spaced\">Coming next</span>\n    <span class=\"portal-nav-link portal-nav-link--disabled\" aria-disabled=\"true\"><span>\u265c</span>Tournaments<em>Coming Soon</em></span>\n    <span class=\"portal-nav-link portal-nav-link--disabled\" aria-disabled=\"true\"><span>\u25a3</span>School Leaving Testimonial<em>Coming Soon</em></span>\n  </nav>\n  <button class=\"portal-logout\" id=\"portalLogout\" type=\"button\"><span>\u21aa</span>Log Out</button>\n</aside>\n<header class=\"portal-mobile-bar\"><a class=\"portal-mobile-brand\" href=\"/student/dashboard.html\"><img src=\"/assets/img/logo.png\" alt=\"Go-Tegs logo\" /><span>Go-Tegs <small>Student Portal</small></span></a><button class=\"portal-mobile-toggle\" id=\"portalMobileToggle\" type=\"button\" aria-label=\"Open student portal menu\" aria-expanded=\"false\">\u2630</button></header>\n<div class=\"portal-mobile-scrim\" id=\"portalMobileScrim\"></div>\n<aside class=\"portal-mobile-drawer\" id=\"portalMobileDrawer\" aria-label=\"Mobile student portal menu\"><div class=\"portal-mobile-drawer-head\"><div class=\"portal-profile-mini\"><div class=\"portal-profile-avatar\"><img src=\"/assets/img/logo.png\" data-portal-profile-image alt=\"Go-Tegs logo\" /><span class=\"portal-profile-initials\" data-portal-initials aria-hidden=\"true\"></span></div><div><strong data-portal-name>Student</strong><span data-portal-class>Portal account</span></div></div><button id=\"portalMobileClose\" type=\"button\" aria-label=\"Close menu\">\u00d7</button></div><nav class=\"portal-nav\" aria-label=\"Mobile student workspace\"><a class=\"portal-nav-link\" data-portal-link=\"dashboard\" href=\"/student/dashboard.html\"><span>\u2302</span>Dashboard</a><a class=\"portal-nav-link\" data-portal-link=\"profile\" href=\"/student/profile.html\"><span>\u25c9</span>Profile</a><a class=\"portal-nav-link\" data-portal-link=\"results\" href=\"/student/result/index.html\"><span>\u25a5</span>Results</a><a class=\"portal-nav-link\" data-portal-link=\"notes\" href=\"/student/lesson-notes/index.html\"><span>\u25a4</span>Lesson Notes</a><a class=\"portal-nav-link\" data-portal-link=\"quiz\" href=\"/student/quiz/\"><span>\u2726</span>Quiz &amp; Practice</a><a class=\"portal-nav-link\" data-portal-link=\"quiz-code\" href=\"/student/quiz-code/\"><span>\u2318</span>Quiz Code</a><a class=\"portal-nav-link\" data-portal-link=\"store\" href=\"/student/store/\"><span>\u25eb</span>Store</a><span class=\"portal-nav-link portal-nav-link--disabled\" aria-disabled=\"true\"><span>\u265c</span>Tournaments<em>Coming Soon</em></span><span class=\"portal-nav-link portal-nav-link--disabled\" aria-disabled=\"true\"><span>\u25a3</span>School Leaving Testimonial<em>Coming Soon</em></span></nav><button class=\"portal-logout\" id=\"portalLogoutMobile\" type=\"button\"><span>\u21aa</span>Log Out</button></aside>";
const STUDENT_MOBILE_FALLBACK="<header class=\"portal-mobile-bar\"><a class=\"portal-mobile-brand\" href=\"/student/dashboard.html\"><img src=\"/assets/img/logo.png\" alt=\"Go-Tegs logo\" /><span>Go-Tegs <small>Student Portal</small></span></a><button class=\"portal-mobile-toggle\" id=\"portalMobileToggle\" type=\"button\" aria-label=\"Open student portal menu\" aria-expanded=\"false\">\u2630</button></header>\n<div class=\"portal-mobile-scrim\" id=\"portalMobileScrim\"></div>\n<aside class=\"portal-mobile-drawer\" id=\"portalMobileDrawer\" aria-label=\"Mobile student portal menu\"><div class=\"portal-mobile-drawer-head\"><div class=\"portal-profile-mini\"><div class=\"portal-profile-avatar\"><img src=\"/assets/img/logo.png\" data-portal-profile-image alt=\"Go-Tegs logo\" /><span class=\"portal-profile-initials\" data-portal-initials aria-hidden=\"true\"></span></div><div><strong data-portal-name>Student</strong><span data-portal-class>Portal account</span></div></div><button id=\"portalMobileClose\" type=\"button\" aria-label=\"Close menu\">\u00d7</button></div><nav class=\"portal-nav\" aria-label=\"Mobile student workspace\"><a class=\"portal-nav-link\" data-portal-link=\"dashboard\" href=\"/student/dashboard.html\"><span>\u2302</span>Dashboard</a><a class=\"portal-nav-link\" data-portal-link=\"profile\" href=\"/student/profile.html\"><span>\u25c9</span>Profile</a><a class=\"portal-nav-link\" data-portal-link=\"results\" href=\"/student/result/index.html\"><span>\u25a5</span>Results</a><a class=\"portal-nav-link\" data-portal-link=\"notes\" href=\"/student/lesson-notes/index.html\"><span>\u25a4</span>Lesson Notes</a><a class=\"portal-nav-link\" data-portal-link=\"quiz\" href=\"/student/quiz/\"><span>\u2726</span>Quiz &amp; Practice</a><a class=\"portal-nav-link\" data-portal-link=\"quiz-code\" href=\"/student/quiz-code/\"><span>\u2318</span>Quiz Code</a><a class=\"portal-nav-link\" data-portal-link=\"store\" href=\"/student/store/\"><span>\u25eb</span>Store</a><span class=\"portal-nav-link portal-nav-link--disabled\" aria-disabled=\"true\"><span>\u265c</span>Tournaments<em>Coming Soon</em></span><span class=\"portal-nav-link portal-nav-link--disabled\" aria-disabled=\"true\"><span>\u25a3</span>School Leaving Testimonial<em>Coming Soon</em></span></nav><button class=\"portal-logout\" id=\"portalLogoutMobile\" type=\"button\"><span>\u21aa</span>Log Out</button></aside>";

function mountStudentMobileControls(){
  let target=document.getElementById('navbar-placeholder');
  if(!target){target=document.createElement('div');target.id='navbar-placeholder';document.body.prepend(target);}
  const hasRail=!!target.querySelector('.portal-rail');
  const hasToggle=!!document.getElementById('portalMobileToggle');
  if(!hasRail) target.innerHTML=STUDENT_SHELL_FALLBACK;
  else if(!hasToggle) target.insertAdjacentHTML('beforeend',STUDENT_MOBILE_FALLBACK);
  const ready=!!(document.getElementById('portalMobileToggle')&&document.getElementById('portalMobileDrawer')&&document.getElementById('portalMobileScrim'));
  if(!ready) console.error('[Go-Tegs] Student mobile navigation could not be mounted.');
  return ready;
}

function initStudentMobileNavigation(){
  if(document.documentElement.dataset.gotegsMobileNav==='1') return;
  document.documentElement.dataset.gotegsMobileNav='1';
  let isOpen=false;
  const setOpen=open=>{
    const drawer=document.getElementById('portalMobileDrawer'),scrim=document.getElementById('portalMobileScrim'),toggle=document.getElementById('portalMobileToggle');
    if(!drawer||!scrim||!toggle){console.error('[Go-Tegs] Mobile menu controls missing during toggle.');return;}
    isOpen=!!open;
    drawer.classList.toggle('open',isOpen);
    scrim.classList.toggle('open',isOpen);
    toggle.setAttribute('aria-expanded',String(isOpen));
    toggle.setAttribute('aria-label',isOpen?'Close student portal menu':'Open student portal menu');
    document.body.style.overflow=isOpen?'hidden':'';
  };
  document.addEventListener('click',e=>{
    const el=e.target instanceof Element?e.target:null;
    if(el?.closest('#portalMobileToggle')){e.preventDefault();e.stopPropagation();setOpen(!isOpen);return;}
    if(el?.closest('#portalMobileClose,#portalMobileScrim')){e.preventDefault();setOpen(false);return;}
    if(el?.closest('#portalMobileDrawer a'))setOpen(false);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
  window.addEventListener('resize',()=>{if(window.innerWidth>899)setOpen(false);},{passive:true});
}

async function loadNotesScriptsIfNeeded(){
  const needsNotes=!!document.querySelector('.note-file,.admin-notes-table,#export-all-notes');
  if(!needsNotes)return;
  try{
    if(!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if(typeof supabaseClient==='undefined') await loadScript('/assets/js/supabase-config.js');
    if(!window.__gotegsNotesLoaded) await loadScript('/assets/js/notes.js');
  }catch(err){console.error('Failed to load lesson notes scripts:',err);}
}

async function ensureStudentShell(){
  if(!document.getElementById('portalMobileToggle')) await injectPartial('/partials/student-shell.html','navbar-placeholder');
  return mountStudentMobileControls();
}

function studentInitials(name){return String(name||'Student').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase()||'GT';}
function setPortalAvatar(img, initialsEl, session){const fallbackLogo='/assets/img/logo.png';if(img){if(session.profile_pic_url){img.src=session.profile_pic_url;img.alt=`${session.full_name||'Student'} profile picture`;}else{img.src=fallbackLogo;img.alt='Go-Tegs logo';}}if(initialsEl)initialsEl.textContent=studentInitials(session.full_name);const holder=img?.closest('.portal-profile-avatar,.portal-card-avatar,.portal-orbit-core,.profile-avatar-xl');if(holder){holder.classList.toggle('has-photo',!!session.profile_pic_url);holder.classList.toggle('show-initials',!!session.profile_pic_removed&&!session.profile_pic_url);}}

function initStudentPortalShell(){const session=getValidStudentSession();if(!session)return;const name=String(session.full_name||'Student');const classLine=`${session.class||'Student'}${session.dept?' · '+session.dept:''}`;document.querySelectorAll('[data-portal-name]').forEach(el=>el.textContent=name);document.querySelectorAll('[data-portal-class]').forEach(el=>el.textContent=classLine);document.querySelectorAll('[data-portal-initials]').forEach(el=>el.textContent=studentInitials(name));document.querySelectorAll('[data-portal-profile-image],[data-profile-image]').forEach(img=>setPortalAvatar(img,img.closest('.portal-profile-avatar,.portal-orbit-core,.profile-avatar-xl')?.querySelector('[data-portal-initials]'),session));
  const path=window.location.pathname;let activeKey='';if(path==='/student/dashboard.html'||path==='/student/'||path==='/student/index.html')activeKey='dashboard';else if(path==='/student/profile.html')activeKey='profile';else if(path.startsWith('/student/result/'))activeKey='results';else if(path.startsWith('/student/lesson-notes/'))activeKey='notes';else if(path.startsWith('/student/quiz/'))activeKey='quiz';else if(path.startsWith('/student/quiz-code/'))activeKey='quiz-code';else if(path.startsWith('/student/store/'))activeKey='store';document.querySelectorAll('[data-portal-link]').forEach(link=>link.classList.toggle('is-active',link.dataset.portalLink===activeKey));
  document.querySelectorAll('#portalLogout,#portalLogoutMobile').forEach(button=>button.addEventListener('click',()=>{localStorage.removeItem(STUDENT_SESSION_KEY);sessionStorage.removeItem('gotegs_result_data');window.location.replace('/student/index.html');}));
  initStudentMobileNavigation();
}

function initPortalPointer(){if(window.matchMedia('(pointer: fine)').matches===false||window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.querySelector('.portal-pointer'))return;const dot=document.createElement('div'),ring=document.createElement('div');dot.className='portal-pointer';ring.className='portal-pointer-ring';document.body.append(dot,ring);document.body.classList.add('portal-pointer-enabled');let tx=window.innerWidth/2,ty=window.innerHeight/2,rx=tx,ry=ty,raf=0;const setActive=target=>{const active=!!target;dot.classList.toggle('is-active',active);ring.classList.toggle('is-active',active);};const render=()=>{rx+=(tx-rx)*.22;ry+=(ty-ry)*.22;dot.style.transform=`translate3d(${tx}px,${ty}px,0) translate(-50%,-50%)`;ring.style.transform=`translate3d(${rx}px,${ry}px,0) translate(-50%,-50%)`;raf=requestAnimationFrame(render);};raf=requestAnimationFrame(render);
  document.addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;dot.classList.add('is-visible');ring.classList.add('is-visible');const target=document.elementFromPoint(e.clientX,e.clientY);const interactive=target instanceof Element?target.closest('a,button,[data-portal-interactive],.portal-card,.portal-nav-link'):null;setActive(interactive);},{passive:true});
  document.addEventListener('pointerup',()=>setActive(null),{passive:true});
  document.addEventListener('pointercancel',()=>setActive(null),{passive:true});
  document.addEventListener('mouseleave',()=>{dot.classList.remove('is-visible');ring.classList.remove('is-visible');setActive(null);});
  document.addEventListener('click',()=>setActive(null),{passive:true});
  window.addEventListener('blur',()=>{setActive(null);});window.addEventListener('beforeunload',()=>cancelAnimationFrame(raf));
}
function initPortalTilt(){if(window.matchMedia('(pointer: fine)').matches===false||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.querySelectorAll('[data-tilt-card]').forEach(card=>{card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(900px) rotateX(${(-y*2.5).toFixed(2)}deg) rotateY(${(x*2.5).toFixed(2)}deg) translateY(-5px)`;});card.addEventListener('pointerleave',()=>{card.style.transform='';});});}
function initAdminWorkspaceControls(){if(!isAdminPage()||document.getElementById('gotegsAdminLogout'))return;const b=document.createElement('button');b.type='button';b.id='gotegsAdminLogout';b.textContent='Log out';b.setAttribute('aria-label','Log out of admin portal');b.className='admin-global-logout';b.style.cssText='position:fixed;top:18px;right:18px;z-index:9000;padding:.62rem 1rem;border:1px solid #d9cdd0;border-radius:999px;background:#fff;color:#6f2338;font:800 .72rem var(--font-display,system-ui);box-shadow:0 10px 26px rgba(54,30,36,.1);cursor:pointer;';b.addEventListener('click',()=>{clearAdminSession();window.location.href='/admin/';});document.body.appendChild(b);}

async function initShell(){const adminPage=isAdminPage(),studentPage=isStudentProtectedPath(window.location.pathname);
  if(adminPage){
    document.body.classList.add('admin-shell-page');
    scheduleAdminExpiry();
    initAdminWorkspaceControls();
    await loadNotesScriptsIfNeeded();
  }else if(studentPage){
    const session=getValidStudentSession();
    if(session)touchStudentSession(session);
    document.body.classList.add('student-shell-page');
    ensurePortalStyles();
    await ensureStudentShell();
    initStudentPortalShell();
    initPortalPointer();
    initPortalTilt();
    await loadNotesScriptsIfNeeded();
  }else{
    await injectPartial('/partials/navbar.html','navbar-placeholder');
    await injectPartial('/partials/footer.html','footer-placeholder');
    highlightActiveLink();wireNavGroups();wireMobileToggle();setFooterYear();
  }
}

function setupAdminInactivityTimeout(){if(!isAdminPage())return;const TIMEOUT_MS=30*60*1000;let hiddenAt=null;const mark=()=>{if(hiddenAt===null)hiddenAt=Date.now();};const check=()=>{if(hiddenAt===null)return;const elapsed=Date.now()-hiddenAt;hiddenAt=null;if(elapsed>=TIMEOUT_MS){clearAdminSession();window.location.reload();}};document.addEventListener('visibilitychange',()=>document.hidden?mark():check());window.addEventListener('blur',mark);window.addEventListener('focus',check);}

document.addEventListener('DOMContentLoaded',()=>{if(adminGatePassedOrNotNeeded()){initShell();if(isAdminPage())document.dispatchEvent(new CustomEvent('gotegs:admin-authenticated'));}else showAdminGate();setupAdminInactivityTimeout();});

window.addEventListener('pageshow',()=>{if(isStudentProtectedPath(window.location.pathname)&&!getValidStudentSession()){document.documentElement.style.visibility='hidden';window.location.replace('/student/index.html');}});
