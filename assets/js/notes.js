// Go-Tegs Lesson Notes runtime
// Former paste/type editor is restored. Notes are stored as HTML in Supabase.
// The same file powers admin note editing and student/public note links.

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
    return { section: parts.includes('sss') ? 'sss' : 'jss', dept: null };
  }

  // IMPORTANT: supabase-js v2 requires .select() before filters such as .eq().
  // The previous export patch accidentally called .eq() directly on .from(),
  // which caused: "supabaseClient.from(...).eq is not a function".
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
    let query = buildNoteQuery('lesson_notes', className, term, subject, dept);
    let result = await query.order('uploaded_at', { ascending: false }).limit(1);

    // Older content may have been stored with a department value even though
    // the current site uses a flat SSS/JSS structure. If there is no flat row,
    // gracefully fall back to the newest matching note regardless of dept.
    if (!result.error && (!result.data || result.data.length === 0) && !dept) {
      result = await supabaseClient
        .from('lesson_notes')
        .select('id,content,uploaded_at,dept')
        .eq('class_name', className)
        .eq('term', term)
        .eq('subject', subject)
        .order('uploaded_at', { ascending: false })
        .limit(1);
    }
    return result;
  }

  async function findExisting(className, term, subject, dept) {
    let result = await buildNoteQuery('lesson_notes', className, term, subject, dept, 'id,uploaded_at').order('uploaded_at', { ascending: false });
    if (!result.error && (!result.data || result.data.length === 0) && !dept) {
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
    return !!html && String(html).replace(/<[^>]*>/g, '').trim().length > 0;
  }

  function wireAdminNotesTable() {
    const rows = document.querySelectorAll('.admin-notes-table tr[data-subject]');
    if (!rows.length) return;
    const { dept, section } = parsePathContext();

    rows.forEach((row) => {
      const subject = row.dataset.subject || '';
      const className = row.dataset.class || '';
      const term = row.dataset.term || '';
      const cells = row.querySelectorAll('td');
      const noteCell = cells[1];
      const actionCell = cells[2];
      const statusCell = cells[3];
      if (!noteCell || !actionCell || !statusCell) return;

      noteCell.innerHTML = `
        <div class="note-toolbar" style="margin-bottom:4px;display:flex;gap:4px;flex-wrap:wrap;">
          <button type="button" data-cmd="bold" style="font-weight:700;padding:2px 8px;">B</button>
          <button type="button" data-cmd="italic" style="font-style:italic;padding:2px 8px;">I</button>
          <button type="button" data-cmd="underline" style="text-decoration:underline;padding:2px 8px;">U</button>
        </div>
        <div class="note-editor" contenteditable="true" role="textbox" aria-label="${subject} lesson note"
          style="min-height:90px;max-height:260px;overflow-y:auto;border:1px solid #d7e1ea;border-radius:8px;padding:9px;background:#fff;font-size:.86rem;line-height:1.55;">
        </div>`;

      const editor = noteCell.querySelector('.note-editor');
      noteCell.querySelectorAll('.note-toolbar button').forEach((button) => {
        button.addEventListener('click', () => {
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
          if (latest?.content) {
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
            const keepId = existing[0].id;
            const { error } = await supabaseClient
              .from('lesson_notes')
              .update({ content: html, uploaded_at: now, dept: dept })
              .eq('id', keepId);
            if (error) throw error;
            if (existing.length > 1) {
              const duplicateIds = existing.slice(1).map((r) => r.id).filter(Boolean);
              if (duplicateIds.length) await supabaseClient.from('lesson_notes').delete().in('id', duplicateIds);
            }
          } else {
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

  function setupExport() {
    const button = document.getElementById('export-all-notes');
    if (!button || button.dataset.wired === '1') return;
    button.dataset.wired = '1';
    const status = document.getElementById('notes-export-status');
    const bar = document.getElementById('notes-export-progress-bar');
    const overlay = document.getElementById('notes-export-overlay');
    const bigBar = document.getElementById('notes-export-big-bar');
    const percent = document.getElementById('notes-export-percent');
    const message = document.getElementById('notes-export-progress-message');
    const count = document.getElementById('notes-export-count');
    const setProgress = (p, msg, detail) => {
      const value = Math.max(0, Math.min(100, Math.round(p)));
      if (bar) bar.style.width = value + '%';
      if (bigBar) bigBar.style.width = value + '%';
      if (percent) percent.textContent = value + '%';
      if (message && msg) message.textContent = msg;
      if (count && detail) count.textContent = detail;
    };
    const pause = () => new Promise(requestAnimationFrame);
    const safeName = (v) => String(v || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled';
    const sectionLabel = (v) => String(v || '').toLowerCase().includes('sss') ? 'Senior Arm' : 'Junior Arm';

    async function getMetadataPage(afterId, size) {
      let query = supabaseClient.from('lesson_notes')
        .select('id,section,class_name,dept,term,subject,uploaded_at')
        .order('id', { ascending: true }).limit(size);
      if (afterId !== null) query = query.gt('id', afterId);
      return query;
    }

    async function getContentBatch(ids) {
      if (!ids.length) return [];
      const result = await supabaseClient.from('lesson_notes').select('id,content').in('id', ids);
      if (!result.error) return result.data || [];
      if (ids.length === 1) throw result.error;
      const rows = [];
      for (const id of ids) {
        const one = await supabaseClient.from('lesson_notes').select('id,content').eq('id', id).maybeSingle();
        if (one.error) throw one.error;
        if (one.data) rows.push(one.data);
      }
      return rows;
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Preparing…';
      if (overlay) overlay.hidden = false;
      setProgress(2, 'Connecting to Supabase…', 'Starting…');
      try {
        await ensureSupabase();
        await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js');
        if (!window.JSZip || !window.htmlDocx) throw new Error('Document download tools could not be loaded.');

        const pageSize = 10;
        const metadata = [];
        let afterId = null;
        while (true) {
          const { data, error } = await getMetadataPage(afterId, pageSize);
          if (error) throw new Error(`Could not read lesson-note records: ${error.message}`);
          const rows = data || [];
          if (!rows.length) break;
          metadata.push(...rows);
          afterId = rows[rows.length - 1].id;
          setProgress(Math.min(20, 5 + metadata.length / 10), 'Reading lesson-note index…', `Indexed ${metadata.length} records`);
          if (rows.length < pageSize) break;
          await pause();
        }

        if (!metadata.length) {
          setProgress(100, 'No saved lesson notes found.', 'Nothing to download.');
          if (status) status.textContent = 'No saved lesson notes were found.';
          return;
        }

        const selected = new Map();
        const zip = new JSZip();
        for (let start = 0; start < metadata.length; start += pageSize) {
          const chunk = metadata.slice(start, start + pageSize);
          const contents = await getContentBatch(chunk.map((row) => row.id));
          const byId = new Map(contents.map((row) => [String(row.id), row.content]));
          chunk.forEach((meta) => {
            const content = byId.get(String(meta.id));
            if (!hasText(content)) return;
            const key = [meta.section, meta.class_name, meta.dept, meta.term, meta.subject].map((v) => String(v ?? '').toLowerCase().trim()).join('|');
            const old = selected.get(key);
            if (!old || new Date(meta.uploaded_at || 0).getTime() >= new Date(old.uploaded_at || 0).getTime()) selected.set(key, { ...meta, content });
          });
          setProgress(20 + Math.round((Math.min(start + chunk.length, metadata.length) / metadata.length) * 25), 'Pulling lesson-note content…', `${Math.min(start + chunk.length, metadata.length)} of ${metadata.length} records`);
          await pause();
        }

        const notes = [...selected.values()].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
        if (!notes.length) {
          setProgress(100, 'No saved lesson notes with content were found.', 'Nothing to download.');
          if (status) status.textContent = 'No saved lesson notes with content were found.';
          return;
        }

        notes.forEach((note, index) => {
          const parts = ['Lesson Notes', sectionLabel(note.section), safeName(note.class_name || 'Class'), note.dept ? safeName(note.dept) : null, safeName(note.term || 'Term')].filter(Boolean);
          const subject = safeName(note.subject || 'Lesson Note');
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject}</title></head><body>${note.content}</body></html>`;
          zip.file(`${parts.join('/')}/${subject}.docx`, window.htmlDocx.asBlob(html, { orientation: 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } }));
          setProgress(45 + Math.round(((index + 1) / notes.length) * 35), 'Preparing Word documents…', `${index + 1} of ${notes.length} · ${subject}`);
        });

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) => {
          setProgress(80 + Math.round(meta.percent * 0.2), 'Compressing the ZIP…', `Compressing ${Math.round(meta.percent)}%`);
        });

        setProgress(100, 'Download ready.', `${notes.length} lesson notes prepared.`);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Go-Tegs-Lesson-Notes-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        if (status) status.textContent = `Done — ${notes.length} lesson notes packaged and downloaded.`;
      } catch (error) {
        console.error('Lesson notes export failed:', error);
        setProgress(0, 'Export failed.', error?.message || String(error));
        if (status) status.textContent = 'Export failed: ' + (error?.message || String(error));
      } finally {
        if (overlay) overlay.hidden = true;
        button.disabled = false;
        button.textContent = '↓ Download lesson notes ZIP';
      }
    });
  }

  async function init() {
    try {
      await ensureSupabase();
      wireAdminNotesTable();
      wirePublicNoteCells();
      setupExport();
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
