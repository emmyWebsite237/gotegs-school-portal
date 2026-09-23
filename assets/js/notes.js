// ==========================================================================
// Go-Tegs — Lesson Notes: admin paste-in editor + public read-only viewer
// Content (with bold text, images, etc.) is pasted directly by the admin
// and stored as-is, then displayed as-is on the public side — no files,
// no downloads involved.
//
// Guarded against double-loading: some older pages have this script
// hardcoded in the HTML AND it can also be auto-loaded by main.js.
// If either happens more than once, or before Supabase is ready, this
// file safely no-ops instead of throwing errors.
// ==========================================================================

(function () {
  if (window.__gotegsNotesLoaded) return; // already wired up, do nothing

  if (typeof supabaseClient === "undefined") {
    // Running too early (e.g. an old hardcoded <script> tag firing before
    // supabase-config.js loaded). The properly-ordered load from main.js
    // will run this file again later and succeed then.
    return;
  }

  window.__gotegsNotesLoaded = true;

  const NOTES_BUCKET_UNUSED = "lesson-notes-files"; // kept for reference, not used by paste-based content

  function parsePathContext() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const section = parts.includes("sss") ? "sss" : "jss";
    // No more department layer for SSS — both jss and sss are now flat
    // (Class -> Term -> Subject), so dept is always null.
    return { section, dept: null };
  }

  function buildNoteQuery(table, className, term, subject, dept) {
    let query = supabaseClient.from(table).select("*").eq("class_name", className).eq("term", term).eq("subject", subject);
    return dept ? query.eq("dept", dept) : query.is("dept", null);
  }

  // -------------------- ADMIN: paste-in editor --------------------

  function wireAdminNotesTable() {
    const rows = document.querySelectorAll(".admin-notes-table tr[data-subject]");
    if (!rows.length) return;

    const { dept, section } = parsePathContext();

    rows.forEach(async (row) => {
      const subject = row.dataset.subject;
      const className = row.dataset.class;
      const term = row.dataset.term;

      const cells = row.querySelectorAll("td");
      const uploadCell = cells[1];
      const saveBtnCell = cells[2];
      const statusCell = cells[3];

      // Replace the old file input cell with a paste-in editor
      uploadCell.innerHTML = `
        <div class="note-toolbar" style="margin-bottom:4px; display:flex; gap:4px;">
          <button type="button" data-cmd="bold" style="font-weight:bold; padding:2px 8px;">B</button>
          <button type="button" data-cmd="italic" style="font-style:italic; padding:2px 8px;">I</button>
          <button type="button" data-cmd="underline" style="text-decoration:underline; padding:2px 8px;">U</button>
        </div>
        <div class="note-editor" contenteditable="true"
          style="min-height:80px; max-height:200px; overflow-y:auto; border:1px solid #e3ece9; border-radius:6px; padding:8px; background:#fff; font-size:0.85rem;"
          placeholder="Paste or type the note here...">
        </div>
      `;

      const editor = uploadCell.querySelector(".note-editor");
      uploadCell.querySelectorAll(".note-toolbar button").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.execCommand(btn.dataset.cmd, false, null);
          editor.focus();
        });
      });

      saveBtnCell.querySelector(".btn-save").textContent = "Save Note";

      // Load existing content if any
      try {
        const { data } = await buildNoteQuery("lesson_notes", className, term, subject, dept).select("*");
        if (data && data.length > 0) {
          const latest = data[0];
          editor.innerHTML = latest.content || "";
          statusCell.textContent = "Saved " + new Date(latest.uploaded_at).toLocaleDateString();
        }
      } catch (err) {
        console.error("Load note failed:", err);
      }

      saveBtnCell.querySelector(".btn-save").addEventListener("click", async () => {
        const html = editor.innerHTML.trim();
        if (!html) {
          statusCell.textContent = "Nothing to save — paste or type a note first.";
          return;
        }

        const btn = saveBtnCell.querySelector(".btn-save");
        btn.disabled = true;
        btn.textContent = "Saving...";
        statusCell.textContent = "Saving...";

        try {
          // Explicitly check for an existing row first, since Postgres does not
          // treat NULL "dept" values as matching for ON CONFLICT purposes —
          // relying on upsert() alone caused duplicate rows for JSS subjects.
          const { data: existing, error: findError } = await buildNoteQuery(
            "lesson_notes", className, term, subject, dept
          ).select("id");

          if (findError) throw findError;

          if (existing && existing.length > 0) {
            // Update the first match, and clean up any accidental duplicates
            const keepId = existing[0].id;
            const { error: updateError } = await supabaseClient
              .from("lesson_notes")
              .update({ content: html, uploaded_at: new Date().toISOString() })
              .eq("id", keepId);
            if (updateError) throw updateError;

            if (existing.length > 1) {
              const duplicateIds = existing.slice(1).map((r) => r.id);
              await supabaseClient.from("lesson_notes").delete().in("id", duplicateIds);
            }
          } else {
            const { error: insertError } = await supabaseClient.from("lesson_notes").insert({
              section,
              class_name: className,
              dept: dept,
              term: term,
              subject: subject,
              content: html,
              uploaded_at: new Date().toISOString(),
            });
            if (insertError) throw insertError;
          }

          statusCell.textContent = "Saved " + new Date().toLocaleDateString();
        } catch (err) {
          statusCell.textContent = "Error: " + err.message;
        } finally {
          btn.disabled = false;
          btn.textContent = "Save Note";
        }
      });
    });
  }

  // -------------------- PUBLIC: link to the dedicated note page --------------------
  // Each note now opens on its own real page (bookmarkable, back-button
  // friendly) instead of a JS popup.

  function wirePublicNoteCells() {
    const cells = document.querySelectorAll(".note-file[data-subject]");
    if (!cells.length) return;

    const { dept } = parsePathContext();

    cells.forEach(async (cell) => {
      const subject = cell.dataset.subject;
      const className = cell.dataset.class;
      const term = cell.dataset.term;

      try {
        const { data } = await buildNoteQuery("lesson_notes", className, term, subject, dept).select("*");

        if (data && data.length > 0 && data[0].content) {
          const url = new URLSearchParams({ class: className, term, subject });
          if (dept) url.set("dept", dept);

          const link = document.createElement("a");
          link.className = "btn-save";
          link.href = `/lesson-notes/view-note.html?${url.toString()}`;
          link.textContent = "View Note";
          cell.innerHTML = "";
          cell.appendChild(link);
        }
      } catch (err) {
        console.error("Failed to check note:", err);
      }
    });
  }

  wireAdminNotesTable();
  wirePublicNoteCells();
})();

// -------------------- ADMIN: export all stored notes --------------------
// Uses the existing lesson_notes rows. This never touches student results/check counts.
(function wireNotesExport(){
  const button=document.getElementById('export-all-notes');
  const status=document.getElementById('notes-export-status');
  if(!button || button.dataset.wired==='1') return;
  button.dataset.wired='1';

  const loadExternal=src=>new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[src="${src}"]`);
    if(existing){
      if(existing.dataset.loaded==='1'){resolve();return;}
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const el=document.createElement('script');
    el.src=src;
    el.onload=()=>{el.dataset.loaded='1';resolve();};
    el.onerror=()=>reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });

  const sectionLabel=section=>{
    const value=String(section||'').toLowerCase();
    return value.includes('sss') ? 'Senior Arm' : 'Junior Arm';
  };
  const safeName=value=>String(value||'Untitled')
    .replace(/[\\/:*?"<>|]+/g,'-')
    .replace(/\s+/g,' ')
    .trim() || 'Untitled';
  const key=row=>[row.section,row.class_name,row.dept,row.term,row.subject]
    .map(v=>String(v||'').trim().toLowerCase()).join('|');

  button.addEventListener('click',async()=>{
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Preparing…';
    try{
      if(status)status.textContent='Connecting to Supabase…';
      await loadExternal('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      await loadExternal('https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js');
      if(!window.JSZip) throw new Error('ZIP generator failed to load.');
      if(!window.htmlDocx) throw new Error('Word document converter failed to load.');

      const {data,error}=await supabaseClient
        .from('lesson_notes')
        .select('section,class_name,dept,term,subject,content,uploaded_at')
        .order('uploaded_at',{ascending:false});
      if(error) throw error;

      const seen=new Set();
      const notes=(Array.isArray(data)?data:[]).filter(row=>{
        const k=key(row);
        if(seen.has(k)) return false;
        seen.add(k);
        return !!row.content && !!String(row.content).replace(/<[^>]*>/g,'').trim();
      });
      if(!notes.length){
        if(status)status.textContent='No saved lesson notes with content were found.';
        return;
      }

      const zip=new JSZip();
      for(let i=0;i<notes.length;i++){
        const row=notes[i];
        const folder=[
          'Lesson Notes',
          sectionLabel(row.section),
          safeName(row.class_name||'Class'),
          row.dept ? safeName(row.dept) : null,
          safeName(row.term||'Term')
        ].filter(Boolean).join('/');
        const subject=safeName(row.subject||'Lesson Note');
        const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject}</title></head><body>${row.content}</body></html>`;
        const docBlob=window.htmlDocx.asBlob(html,{orientation:'portrait',margins:{top:720,right:720,bottom:720,left:720}});
        zip.file(`${folder}/${subject}.docx`,docBlob);
        if(status)status.textContent=`Preparing ${i+1} of ${notes.length}: ${subject}`;
        await new Promise(requestAnimationFrame);
      }

      if(status)status.textContent=`Compressing ${notes.length} Word documents…`;
      const blob=await zip.generateAsync(
        {type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},
        meta=>{if(status)status.textContent=`Compressing… ${Math.round(meta.percent)}%`;}
      );
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`Go-Tegs-Lesson-Notes-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      if(status)status.textContent=`Done — ${notes.length} .docx lesson notes downloaded.`;
    }catch(err){
      console.error('Lesson notes export failed:',err);
      if(status)status.textContent='Export failed: '+(err?.message||String(err));
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  });
})();
