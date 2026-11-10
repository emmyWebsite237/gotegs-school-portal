// Go-Tegs Lesson Notes Runtime
// Checks for static DOCX files in /lesson-notes/documents/ and provides View/Download controls.

(function(){
  if(window.__gotegsNotesBooted) return;
  window.__gotegsNotesBooted = true;

  function escapeHtml(value){
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function sectionForClass(value){
    return String(value||'').toLowerCase().startsWith('jss') ? 'jss' : 'ss';
  }

  function classFolder(value){
    const m = String(value||'').trim().toLowerCase().match(/(jss|sss|ss)\s*([1-3])/i);
    return m ? `${m[1].toLowerCase()==='jss'?'jss':'ss'}${m[2]}` : String(value||'').trim().toLowerCase().replace(/\s+/g,'-');
  }

  function termFolder(value){
    const m = String(value||'').match(/(1|2|3)/);
    return m ? `term${m[1]}` : String(value||'').trim().toLowerCase().replace(/\s+/g,'-');
  }

  function noteUrl(className, term, subject){
    const file = `${String(subject||'').trim()}.docx`;
    return `/lesson-notes/documents/${sectionForClass(className)}/${classFolder(className)}/${termFolder(term)}/${encodeURIComponent(file)}`;
  }

  function viewUrl(className, term, subject){
    return `/lesson-notes/view-note.html?class=${encodeURIComponent(className)}&term=${encodeURIComponent(term)}&subject=${encodeURIComponent(subject)}`;
  }

  async function documentExists(url){
    try{
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    }catch(error){
      console.warn('Could not check lesson-note document:', error);
      return false;
    }
  }

  function wirePublicNoteCells(){
    const cells = document.querySelectorAll('.note-file[data-subject]');
    if(!cells.length) return;

    cells.forEach(cell => {
      const className = cell.dataset.class || '';
      const term = cell.dataset.term || '';
      const subject = cell.dataset.subject || '';
      const fileUrl = noteUrl(className, term, subject);
      const previewUrl = viewUrl(className, term, subject);

      cell.innerHTML = '<span class="note-checking">Checking…</span>';

      (async () => {
        const exists = await documentExists(fileUrl);
        if(exists){
          cell.innerHTML = `
            <div class="note-actions-wrap">
              <a class="btn-note-view" href="${previewUrl}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>View Note</span>
              </a>
              <a class="btn-note-download" href="${fileUrl}" download="${subject}.docx" title="Download Word Document">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              </a>
            </div>
          `;
        } else {
          cell.innerHTML = '<span class="note-pending">Not uploaded yet</span>';
        }
      })();
    });
  }

  function wireAdminNotesTable(){
    const rows = document.querySelectorAll('.admin-notes-table tr[data-subject]');
    if(!rows.length) return;

    rows.forEach(row => {
      const subject = row.dataset.subject || '';
      const className = row.dataset.class || '';
      const term = row.dataset.term || '';
      const fileUrl = noteUrl(className, term, subject);
      const view = viewUrl(className, term, subject);
      const fileCell = row.querySelector('td:nth-child(2)');
      const actionCell = row.querySelector('td:nth-child(3)');
      const status = row.querySelector('.upload-status');

      if(fileCell) fileCell.innerHTML = `<code>${escapeHtml(fileUrl)}</code>`;
      if(actionCell) actionCell.innerHTML = `<a class="btn-note-view" href="${view}">View Note</a>`;
      if(status) status.textContent = 'Checking document…';

      documentExists(fileUrl).then(exists => {
        if(status){
          status.textContent = exists ? 'Available on site' : 'Not uploaded yet';
          status.classList.toggle('saved', exists);
          status.classList.toggle('error', !exists);
        }
      });
    });
  }

  function init(){
    wirePublicNoteCells();
    wireAdminNotesTable();
  }

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
