// Go-Tegs Lesson Notes runtime
// Shared by admin lesson-note management and student/public lesson-note links.
// Admin pages now use a clean note-library view with a full-screen editor modal.

(function () {
  if (window.__gotegsNotesBooted) return;
  window.__gotegsNotesBooted = true;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((s) => s.src === src);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => { script.dataset.loaded = '1'; resolve(); };
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (typeof supabaseClient !== 'undefined') return;
    if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if (typeof supabaseClient === 'undefined') await loadScript('/assets/js/supabase-config.js');
    if (typeof supabaseClient === 'undefined') throw new Error('Supabase is not available on this page.');
  }

  function parsePathContext() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const section = parts.includes('sss') ? 'sss' : parts.includes('jss') ? 'jss' : null;
    return { section, dept: null };
  }

  function buildNoteQuery(table, className, term, subject, dept, columns = 'id,content,uploaded_at') {
    let query = supabaseClient
      .from(table)
      .select(columns)
      .eq('class_name', className)
      .eq('term', term)
      .eq('subject', subject);
    return dept ? query.eq('dept', dept) : query.is('dept', null);
  }

  async function latestNote(className, term, subject, dept) {
    let result = await buildNoteQuery('lesson_notes', className, term, subject, dept)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (!result.error && (!result.data || result.data.length === 0)) {
      let fallback = supabaseClient
        .from('lesson_notes')
        .select('id,content,uploaded_at,dept')
        .eq('class_name', className)
        .eq('term', term)
        .eq('subject', subject)
        .order('uploaded_at', { ascending: false })
        .limit(1);

      if (dept) {
        const exact = await fallback.eq('dept', dept);
        if (!exact.error && exact.data?.length) return exact;
        fallback = supabaseClient
          .from('lesson_notes')
          .select('id,content,uploaded_at,dept')
          .eq('class_name', className)
          .eq('term', term)
          .eq('subject', subject)
          .order('uploaded_at', { ascending: false })
          .limit(1);
      }
      result = await fallback;
    }
    return result;
  }

  async function findExisting(className, term, subject, dept) {
    let result = await buildNoteQuery('lesson_notes', className, term, subject, dept, 'id,uploaded_at,dept')
      .order('uploaded_at', { ascending: false });
    if (!result.error && (!result.data || result.data.length === 0)) {
      result = await supabaseClient
        .from('lesson_notes')
        .select('id,uploaded_at,dept')
        .eq('class_name', className)
        .eq('term', term)
        .eq('subject', subject)
        .order('uploaded_at', { ascending: false });
    }
    return result;
  }

  function hasText(html) {
    if (!html) return false;
    const temp = document.createElement('div');
    temp.innerHTML = String(html);
    return (temp.textContent || '').trim().length > 0;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function injectAdminNotesDesign() {
    if (document.getElementById('gotegs-admin-notes-modern-style')) return;

    const style = document.createElement('style');
    style.id = 'gotegs-admin-notes-modern-style';
    style.textContent = `
      /* Admin lesson notes: visual language follows the current Go-Tegs website. */
      .admin-notes-modern {
        max-width: 1180px;
      }
      .admin-notes-modern .admin-notes-intro {
        margin: -.2rem 0 1.5rem;
        max-width: 720px;
        color: #667085;
        font-size: .98rem;
      }
      .admin-notes-modern .notes-library {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }
      .admin-notes-modern .note-library-card {
        position: relative;
        min-width: 0;
        padding: 1.2rem 1.25rem;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, .055);
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      }
      .admin-notes-modern .note-library-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 16px 34px rgba(15, 23, 42, .09);
        border-color: #d6d9df;
      }
      .admin-notes-modern .note-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }
      .admin-notes-modern .note-card-number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        border-radius: 10px;
        background: #f1f5f9;
        color: #475467;
        font-size: .78rem;
        font-weight: 700;
      }
      .admin-notes-modern .note-card-title {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.35;
        color: #101828;
        font-weight: 700;
      }
      .admin-notes-modern .note-card-meta {
        margin: .3rem 0 0;
        color: #667085;
        font-size: .82rem;
      }
      .admin-notes-modern .note-card-status {
        display: inline-flex;
        align-items: center;
        gap: .38rem;
        margin-top: 1rem;
        font-size: .78rem;
        color: #667085;
      }
      .admin-notes-modern .note-card-status::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #cbd5e1;
      }
      .admin-notes-modern .note-card-status.saved::before { background: #22c55e; }
      .admin-notes-modern .note-card-status.error::before { background: #ef4444; }
      .admin-notes-modern .note-card-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        margin-top: 1rem;
        padding: .65rem 1rem;
        border: 1px solid #111827;
        border-radius: 999px;
        background: #111827;
        color: #fff;
        font: inherit;
        font-size: .86rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform .16s ease, opacity .16s ease;
      }
      .admin-notes-modern .note-card-action:hover { transform: translateY(-1px); opacity: .92; }
      .admin-notes-modern .note-card-action:disabled { opacity: .55; cursor: wait; }
      .gotegs-note-modal {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(15, 23, 42, .62);
        backdrop-filter: blur(7px);
      }
      .gotegs-note-modal[hidden] { display: none; }
      .gotegs-note-dialog {
        display: flex;
        flex-direction: column;
        width: min(1040px, 100%);
        max-height: min(92vh, 920px);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.65);
        border-radius: 24px;
        background: #f8fafc;
        box-shadow: 0 28px 80px rgba(15,23,42,.3);
      }
      .gotegs-note-dialog-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.2rem;
        border-bottom: 1px solid #e5e7eb;
        background: #fff;
      }
      .gotegs-note-dialog-title { margin: 0; color: #101828; font-size: 1.05rem; }
      .gotegs-note-dialog-subtitle { margin: .2rem 0 0; color: #667085; font-size: .8rem; }
      .gotegs-note-close {
        width: 38px;
        height: 38px;
        border: 1px solid #e4e7ec;
        border-radius: 50%;
        background: #fff;
        color: #344054;
        font-size: 1.3rem;
        cursor: pointer;
      }
      .gotegs-note-editor-wrap {
        min-height: 0;
        overflow: auto;
        padding: 1rem;
      }
      .gotegs-note-toolbar {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        flex-wrap: wrap;
        gap: .35rem;
        margin: 0 auto .8rem;
        padding: .45rem;
        width: min(900px, 100%);
        border: 1px solid #e4e7ec;
        border-radius: 14px;
        background: rgba(255,255,255,.94);
        box-shadow: 0 8px 22px rgba(15,23,42,.06);
        backdrop-filter: blur(8px);
      }
      .gotegs-note-toolbar button {
        min-width: 36px;
        height: 34px;
        padding: 0 .65rem;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #344054;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .gotegs-note-toolbar button:hover { background: #f2f4f7; }
      .gotegs-note-editor {
        width: min(900px, 100%);
        min-height: 520px;
        margin: 0 auto;
        padding: clamp(1.1rem, 3vw, 2rem);
        border: 1px solid #e4e7ec;
        border-radius: 18px;
        outline: none;
        background: #fff;
        color: #101828;
        line-height: 1.75;
        font-size: 15px;
        box-shadow: 0 12px 34px rgba(15,23,42,.055);
      }
      .gotegs-note-editor:focus { border-color: #98a2b3; box-shadow: 0 0 0 3px rgba(16,24,40,.06), 0 12px 34px rgba(15,23,42,.055); }
      .gotegs-note-editor img, .gotegs-note-editor video, .gotegs-note-editor iframe { max-width: 100%; height: auto; }
      .gotegs-note-editor table { width: 100%; max-width: 100%; border-collapse: collapse; }
      .gotegs-note-editor th, .gotegs-note-editor td { border: 1px solid #d0d5dd; padding: .5rem; overflow-wrap: anywhere; }
      .gotegs-note-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: .85rem 1rem;
        border-top: 1px solid #e5e7eb;
        background: #fff;
      }
      .gotegs-note-save-status { color: #667085; font-size: .82rem; }
      .gotegs-note-save {
        min-width: 130px;
        padding: .72rem 1.15rem;
        border: 0;
        border-radius: 999px;
        background: #111827;
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .gotegs-note-save:disabled { opacity: .55; cursor: wait; }
      @media (max-width: 760px) {
        .admin-notes-modern .notes-library { grid-template-columns: 1fr; }
        .gotegs-note-modal { padding: 0; }
        .gotegs-note-dialog { width: 100%; height: 100%; max-height: 100%; border-radius: 0; }
        .gotegs-note-editor-wrap { padding: .7rem; }
        .gotegs-note-editor { min-height: 58vh; border-radius: 14px; }
        .gotegs-note-footer { padding: .7rem; }
        .gotegs-note-save { flex: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function createAdminModal() {
    let modal = document.getElementById('gotegs-note-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'gotegs-note-modal';
    modal.className = 'gotegs-note-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="gotegs-note-dialog" role="dialog" aria-modal="true" aria-labelledby="gotegs-note-modal-title">
        <header class="gotegs-note-dialog-head">
          <div>
            <h2 class="gotegs-note-dialog-title" id="gotegs-note-modal-title">Edit Lesson Note</h2>
            <p class="gotegs-note-dialog-subtitle" id="gotegs-note-modal-subtitle"></p>
          </div>
          <button type="button" class="gotegs-note-close" aria-label="Close editor">×</button>
        </header>
        <div class="gotegs-note-editor-wrap">
          <div class="gotegs-note-toolbar" role="toolbar" aria-label="Lesson note formatting">
            <button type="button" data-cmd="bold" aria-label="Bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic" aria-label="Italic"><em>I</em></button>
            <button type="button" data-cmd="underline" aria-label="Underline"><u>U</u></button>
            <button type="button" data-cmd="insertUnorderedList" aria-label="Bulleted list">• List</button>
            <button type="button" data-cmd="insertOrderedList" aria-label="Numbered list">1. List</button>
          </div>
          <div class="gotegs-note-editor" id="gotegs-note-editor" contenteditable="true" role="textbox" aria-multiline="true"></div>
        </div>
        <footer class="gotegs-note-footer">
          <span class="gotegs-note-save-status" id="gotegs-note-save-status">Make your changes, then save below.</span>
          <button type="button" class="gotegs-note-save" id="gotegs-note-save">Save Note</button>
        </footer>
      </section>`;

    document.body.appendChild(modal);

    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = '';
      modal.__active = null;
    };
    modal.querySelector('.gotegs-note-close').addEventListener('click', close);
    modal.addEventListener('mousedown', (event) => {
      if (event.target === modal) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) close();
    });

    modal.querySelectorAll('.gotegs-note-toolbar button').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        document.execCommand(button.dataset.cmd, false, null);
        modal.querySelector('#gotegs-note-editor').focus();
      });
    });

    return modal;
  }

  async function saveNote(context, html) {
    const { className, term, subject, dept, section } = context;
    const existingResult = await findExisting(className, term, subject, dept);
    if (existingResult.error) throw existingResult.error;
    const existing = existingResult.data || [];
    const now = new Date().toISOString();

    if (existing.length) {
      const keep = existing[0];
      const update = { content: html, uploaded_at: now };
      if (dept || keep.dept == null) update.dept = dept;

      const { error } = await supabaseClient
        .from('lesson_notes')
        .update(update)
        .eq('id', keep.id);
      if (error) throw error;

      if (existing.length > 1) {
        const duplicateIds = existing.slice(1).map((r) => r.id).filter(Boolean);
        if (duplicateIds.length) {
          const { error: duplicateError } = await supabaseClient
            .from('lesson_notes')
            .delete()
            .in('id', duplicateIds);
          if (duplicateError) console.warn('Could not remove duplicate note rows:', duplicateError);
        }
      }
    } else {
      if (!section) throw new Error('Could not determine the lesson-note section from this page.');
      const { error } = await supabaseClient.from('lesson_notes').insert({
        section,
        class_name: className,
        dept,
        term,
        subject,
        content: html,
        uploaded_at: now,
      });
      if (error) throw error;
    }
  }

  function wireAdminNotesTable() {
    const rows = document.querySelectorAll('.admin-notes-table tr[data-subject]');
    if (!rows.length) return;

    injectAdminNotesDesign();
    const { dept, section } = parsePathContext();
    const table = rows[0].closest('table');
    if (!table) return;

    const wrapper = table.parentElement;
    wrapper.classList.add('admin-notes-modern');

    const intro = wrapper.querySelector('.admin-notes-intro');
    if (!intro) {
      const heading = wrapper.querySelector('h1');
      const p = document.createElement('p');
      p.className = 'admin-notes-intro';
      p.textContent = 'Open any subject to view the complete lesson note, make changes, and save it without leaving this page.';
      if (heading) heading.insertAdjacentElement('afterend', p);
    }

    const library = document.createElement('div');
    library.className = 'notes-library';
    table.parentNode.insertBefore(library, table);
    table.style.display = 'none';

    const modal = createAdminModal();
    const editor = modal.querySelector('#gotegs-note-editor');
    const modalTitle = modal.querySelector('#gotegs-note-modal-title');
    const modalSubtitle = modal.querySelector('#gotegs-note-modal-subtitle');
    const saveButton = modal.querySelector('#gotegs-note-save');
    const saveStatus = modal.querySelector('#gotegs-note-save-status');

    rows.forEach((row, index) => {
      const subject = row.dataset.subject || '';
      const className = row.dataset.class || '';
      const term = row.dataset.term || '';
      const context = { className, term, subject, dept, section };

      const card = document.createElement('article');
      card.className = 'note-library-card';
      card.innerHTML = `
        <div class="note-card-top">
          <div>
            <h2 class="note-card-title">${escapeHtml(subject)}</h2>
            <p class="note-card-meta">${escapeHtml(className)} · ${escapeHtml(term)}</p>
          </div>
          <span class="note-card-number">${String(index + 1).padStart(2, '0')}</span>
        </div>
        <div class="note-card-status">Checking note…</div>
        <button type="button" class="note-card-action">Edit Note</button>`;

      library.appendChild(card);

      const status = card.querySelector('.note-card-status');
      const action = card.querySelector('.note-card-action');
      let latest = null;

      (async () => {
        try {
          const result = await latestNote(className, term, subject, dept);
          if (result.error) throw result.error;
          latest = result.data?.[0] || null;
          if (latest?.content && hasText(latest.content)) {
            status.textContent = `Saved ${latest.uploaded_at ? new Date(latest.uploaded_at).toLocaleDateString() : ''}`.trim();
            status.classList.add('saved');
            action.textContent = 'Edit Note';
          } else {
            status.textContent = 'No note added yet';
            action.textContent = 'Add Note';
          }
        } catch (error) {
          console.error('Load note failed:', error);
          status.textContent = 'Could not load note';
          status.classList.add('error');
        }
      })();

      action.addEventListener('click', async () => {
        modal.__active = context;
        modalTitle.textContent = latest?.content ? `Edit ${subject}` : `Add ${subject}`;
        modalSubtitle.textContent = `${className} · ${term}`;
        editor.innerHTML = latest?.content || '';
        saveStatus.textContent = latest?.content ? 'Edit the note and save your changes below.' : 'Type or paste the lesson note, then save it below.';
        saveButton.disabled = false;
        saveButton.textContent = 'Save Note';
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        setTimeout(() => editor.focus(), 40);

        // Refresh the note when the editor is opened so a stale card cannot
        // overwrite a newer version saved elsewhere.
        try {
          const result = await latestNote(className, term, subject, dept);
          if (!result.error && result.data?.[0]?.content) {
            latest = result.data[0];
            editor.innerHTML = latest.content;
            modalTitle.textContent = `Edit ${subject}`;
          }
        } catch (error) {
          console.warn('Could not refresh note before editing:', error);
        }
      });
    });

    saveButton.addEventListener('click', async () => {
      const context = modal.__active;
      if (!context) return;
      const html = editor.innerHTML.trim();
      if (!hasText(html)) {
        saveStatus.textContent = 'Nothing to save — add some note content first.';
        editor.focus();
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
      saveStatus.textContent = 'Saving your lesson note…';

      try {
        await saveNote(context, html);
        saveStatus.textContent = 'Saved successfully.';

        const matchingCard = [...library.querySelectorAll('.note-library-card')]
          .find((card) => card.querySelector('.note-card-title')?.textContent === context.subject);
        if (matchingCard) {
          const status = matchingCard.querySelector('.note-card-status');
          const action = matchingCard.querySelector('.note-card-action');
          status.textContent = `Saved ${new Date().toLocaleDateString()}`;
          status.classList.remove('error');
          status.classList.add('saved');
          action.textContent = 'Edit Note';
        }
      } catch (error) {
        saveStatus.textContent = 'Error: ' + (error?.message || 'Could not save note.');
        console.error('Save note failed:', error);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Note';
      }
    });
  }

  function wirePublicNoteCells() {
    const cells = document.querySelectorAll('.note-file[data-subject]');
    if (!cells.length) return;
    const { dept } = parsePathContext();

    cells.forEach((cell) => {
      if (cell.dataset.notesWired === '1') return;
      cell.dataset.notesWired = '1';
      const subject = cell.dataset.subject || '';
      const className = cell.dataset.class || '';
      const term = cell.dataset.term || '';

      (async () => {
        try {
          const result = await latestNote(className, term, subject, dept);
          if (result.error) throw result.error;
          const latest = result.data?.[0];
          if (latest && hasText(latest.content)) {
            const url = new URLSearchParams({ class: className, term, subject });
            if (latest.dept) url.set('dept', latest.dept);
            const link = document.createElement('a');
            link.className = 'btn-save';
            link.href = `/lesson-notes/view-note.html?${url.toString()}`;
            link.textContent = 'View Note';
            cell.replaceChildren(link);
          } else {
            cell.innerHTML = '<em>No note added yet.</em>';
          }
        } catch (error) {
          console.error('Failed to check note:', error);
          cell.innerHTML = '<em>Could not load note.</em>';
        }
      })();
    });
  }

  async function init() {
    try {
      await ensureSupabase();
      wireAdminNotesTable();
      wirePublicNoteCells();
    } catch (error) {
      console.error('Lesson notes failed to initialise:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
