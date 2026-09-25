// Go-Tegs Lesson Notes runtime
// Former paste/type editor. Notes are stored as HTML in Supabase.
// This file is shared by admin note-editing tables and student/public note links.

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

    // Existing deployments may contain notes with department values while the
    // current student note index is department-neutral. Fall back gracefully.
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
        // Prefer an exact department first; if absent, fall back to the newest
        // matching note so existing notes remain discoverable.
        fallback = supabaseClient
          .from('lesson_notes')
          .select('id,content,uploaded_at,dept')
          .eq('class_name', className)
          .eq('term', term)
          .eq('subject', subject)
          .eq('dept', dept)
          .order('uploaded_at', { ascending: false })
          .limit(1);
        const exact = await fallback;
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

  function wireAdminNotesTable() {
    const rows = document.querySelectorAll('.admin-notes-table tr[data-subject]');
    if (!rows.length) return;
    const { dept, section } = parsePathContext();

    rows.forEach((row) => {
      if (row.dataset.notesWired === '1') return;
      row.dataset.notesWired = '1';

      const subject = row.dataset.subject || '';
      const className = row.dataset.class || '';
      const term = row.dataset.term || '';
      const cells = row.querySelectorAll('td');
      const noteCell = cells[1];
      const actionCell = cells[2];
      const statusCell = cells[3];
      if (!noteCell || !actionCell || !statusCell) return;

      noteCell.innerHTML = `
        <div class="note-toolbar" role="toolbar" aria-label="Formatting for ${subject}">
          <button type="button" data-cmd="bold" aria-label="Bold"><strong>B</strong></button>
          <button type="button" data-cmd="italic" aria-label="Italic"><em>I</em></button>
          <button type="button" data-cmd="underline" aria-label="Underline"><u>U</u></button>
        </div>
        <div class="note-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${subject} lesson note"></div>`;

      const editor = noteCell.querySelector('.note-editor');
      noteCell.querySelectorAll('.note-toolbar button').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          document.execCommand(button.dataset.cmd, false, null);
          editor.focus();
        });
      });

      const saveButton = actionCell.querySelector('.btn-save');
      if (!saveButton) return;
      saveButton.textContent = 'Save Note';

      (async () => {
        try {
          const result = await latestNote(className, term, subject, dept);
          if (result.error) throw result.error;
          const latest = result.data?.[0];
          if (latest?.content && hasText(latest.content)) {
            editor.innerHTML = latest.content;
            statusCell.textContent = 'Saved ' + (latest.uploaded_at ? new Date(latest.uploaded_at).toLocaleDateString() : '');
          } else {
            statusCell.textContent = 'Nothing saved yet';
          }
        } catch (error) {
          console.error('Load note failed:', error);
          statusCell.textContent = 'Could not load note';
        }
      })();

      saveButton.addEventListener('click', async () => {
        const html = editor.innerHTML.trim();
        if (!hasText(html)) {
          statusCell.textContent = 'Nothing to save — paste or type a note first.';
          editor.focus();
          return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Saving…';
        statusCell.textContent = 'Saving…';
        try {
          const existingResult = await findExisting(className, term, subject, dept);
          if (existingResult.error) throw existingResult.error;
          const existing = existingResult.data || [];
          const now = new Date().toISOString();

          if (existing.length) {
            const keep = existing[0];
            const update = { content: html, uploaded_at: now };
            // Preserve a pre-existing department value when the current page
            // does not specify one, rather than silently erasing metadata.
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

          statusCell.textContent = 'Saved ' + new Date().toLocaleDateString();
        } catch (error) {
          statusCell.textContent = 'Error: ' + (error?.message || 'Could not save note.');
          console.error('Save note failed:', error);
        } finally {
          saveButton.disabled = false;
          saveButton.textContent = 'Save Note';
        }
      });
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
