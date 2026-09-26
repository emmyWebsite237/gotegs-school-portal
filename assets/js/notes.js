// Go-Tegs Lesson Notes runtime — GitHub document mode.
// Lesson-note documents are no longer stored in or read from Supabase.
(function(){
  if(window.__gotegsNotesBooted)return; window.__gotegsNotesBooted=true;
  function sectionFromPath(){const p=location.pathname.split('/').filter(Boolean);return p.includes('sss')?'sss':p.includes('jss')?'jss':null;}
  function slug(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9_-]/g,'');}
  function folder(section){return section==='sss'?'ss':'jss';}
  function config(){return window.GOTEGS_GITHUB_NOTES||{};}
  function inject(){if(document.getElementById('gotegs-github-notes-admin-style'))return;const s=document.createElement('style');s.id='gotegs-github-notes-admin-style';s.textContent='.github-note-admin{padding:1rem 1.1rem;border:1px solid #d8e3ed;border-radius:16px;background:#fff}.github-note-admin a{display:inline-flex;margin-top:.7rem;padding:.65rem 1rem;border-radius:999px;background:#1d63c9;color:#fff;text-decoration:none;font-weight:700}.github-path{font:600 .8rem ui-monospace,monospace;color:#667b8e;word-break:break-all}';document.head.appendChild(s);}
  function run(){inject();document.querySelectorAll('.admin-notes-table tr[data-subject]').forEach(row=>{const subject=row.dataset.subject,cls=row.dataset.class,term=row.dataset.term,section=sectionFromPath(),cfg=config(),base=String(cfg.WEB_BASE_URL||'').replace(/\/$/,'');const cell=row.querySelector('td:nth-child(2)'),action=row.querySelector('.btn-save'),status=row.querySelector('.upload-status');if(cell)cell.innerHTML='<div class="github-note-admin"><strong>GitHub document</strong><div class="github-path">'+folder(section)+'/'+slug(cls)+'/'+slug(term)+'/'+subject+'.docx</div><a target="_blank" rel="noopener" href="'+base+'/'+folder(section)+'/'+slug(cls)+'/'+slug(term)+'">Open GitHub folder</a></div>';if(action)action.remove();if(status)status.textContent='Upload/update this DOCX directly in GitHub.';});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
