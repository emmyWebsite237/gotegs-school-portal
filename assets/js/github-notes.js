// Go-Tegs Lesson Notes — GitHub document loader
(function(){
  const cfg = window.GOTEGS_GITHUB_NOTES || {};
  const rawBase = String(cfg.RAW_BASE_URL || '').replace(/\/$/, '');
  const webBase = String(cfg.WEB_BASE_URL || '').replace(/\/$/, '');
  const ready = rawBase && !rawBase.includes('YOUR-USERNAME');

  function slug(v){ return String(v || '').trim().toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9_-]/g,''); }
  function sectionFolder(section){ return section === 'sss' ? 'ss' : 'jss'; }
  function docUrl(section, cls, term, subject){
    return rawBase + '/' + sectionFolder(section) + '/' + slug(cls) + '/' + slug(term) + '/' + encodeURIComponent(subject) + '.docx';
  }
  function webFolder(section, cls, term){
    return webBase + '/' + sectionFolder(section) + '/' + slug(cls) + '/' + slug(term);
  }
  function contextFromPage(){
    const parts = location.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('lesson-notes');
    if(i < 0) return {};
    const section = parts[i+1] || '';
    const cls = parts[i+2] || '';
    const term = parts[i+3] ? parts[i+3].replace(/\.html$/,'') : '';
    return {section, cls: cls.toUpperCase(), term: term.replace(/(term)(\d+)/i,'Term $2')};
  }
  function setupTermPage(){
    const rows = document.querySelectorAll('.note-file');
    if(!rows.length) return;
    const ctx = contextFromPage();
    rows.forEach(cell=>{
      const subject = cell.dataset.subject || cell.closest('tr')?.dataset.subject || '';
      const cls = cell.dataset.class || ctx.cls;
      const term = cell.dataset.term || ctx.term;
      const url = docUrl(ctx.section, cls, term, subject);
      cell.innerHTML = '';
      const a = document.createElement('a');
      a.className = 'note-view-btn';
      a.href = '/lesson-notes/view-note.html?class=' + encodeURIComponent(cls) + '&term=' + encodeURIComponent(term) + '&subject=' + encodeURIComponent(subject) + '&section=' + encodeURIComponent(ctx.section);
      a.textContent = 'View Note';
      cell.appendChild(a);
      const status = document.createElement('span');
      status.className='note-source-status';
      status.textContent='GitHub document';
      cell.appendChild(status);
    });
    if(!ready){
      const box=document.createElement('div'); box.className='github-notes-warning';
      box.innerHTML='<strong>GitHub notes source is not configured yet.</strong><br>Set the repository once in <code>/assets/js/github-notes-config.js</code>, then upload the DOCX files to the matching folders.';
      document.querySelector('main')?.prepend(box);
    }
  }
  window.GoTegsGitHubNotes={ready,docUrl,webFolder,contextFromPage};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setupTermPage); else setupTermPage();
})();
