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
    let query = supabaseClient.from(table).eq("class_name", className).eq("term", term).eq("subject", subject);
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
        const { data } = await buildNoteQuery("lesson_notes", className, term, subject, dept).select("id,content,uploaded_at").order("uploaded_at", { ascending: false }).limit(1);
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
        const { data } = await buildNoteQuery("lesson_notes", className, term, subject, dept).select("id,content,uploaded_at").order("uploaded_at", { ascending: false }).limit(1);

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
// Large, unbounded SELECTs of all lesson-note HTML can hit Supabase statement
// timeouts. Export is therefore keyset-paginated on the primary key and pulls
// note bodies in small batches. The download is still created entirely in the
// browser and never touches student-result/check-count data.
(function wireNotesExport(){
  const button=document.getElementById('export-all-notes');
  const status=document.getElementById('notes-export-status');
  const bar=document.getElementById('notes-export-progress-bar');
  const overlay=document.getElementById('notes-export-overlay');
  const bigBar=document.getElementById('notes-export-big-bar');
  const percent=document.getElementById('notes-export-percent');
  const message=document.getElementById('notes-export-progress-message');
  const count=document.getElementById('notes-export-count');
  if(!button || button.dataset.wired==='1') return;
  button.dataset.wired='1';

  const setProgress=(p,msg,detail)=>{
    const value=Math.max(0,Math.min(100,Math.round(p)));
    if(bar)bar.style.width=value+'%';
    if(bigBar)bigBar.style.width=value+'%';
    if(percent)percent.textContent=value+'%';
    if(message&&msg)message.textContent=msg;
    if(count&&detail)count.textContent=detail;
  };
  const waitFor=async(predicate,timeout=8000)=>{
    const started=Date.now();
    while(Date.now()-started<timeout){
      if(predicate())return true;
      await new Promise(r=>setTimeout(r,100));
    }
    return false;
  };
  const loadExternal=urls=>new Promise((resolve,reject)=>{
    const candidates=Array.isArray(urls)?urls:[urls];
    let i=0;
    const tryNext=()=>{
      if(i>=candidates.length){reject(new Error('Required download component could not be loaded.'));return;}
      const src=candidates[i++];
      const existing=[...document.scripts].find(s=>s.src===src||s.dataset.gotegsExternal===src);
      if(existing){
        if(existing.dataset.loaded==='1'){resolve();return;}
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',tryNext,{once:true});
        return;
      }
      const el=document.createElement('script');
      el.src=src;
      el.dataset.gotegsExternal=src;
      el.onload=()=>{el.dataset.loaded='1';resolve();};
      el.onerror=tryNext;
      document.head.appendChild(el);
    };
    tryNext();
  });

  const sectionLabel=section=>String(section||'').toLowerCase().includes('sss')?'Senior Arm':'Junior Arm';
  const safeName=value=>String(value||'Untitled').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim()||'Untitled';
  const key=row=>[row.section,row.class_name,row.dept,row.term,row.subject].map(v=>String(v??'').trim().toLowerCase()).join('|');
  const hasText=html=>!!html&&!!String(html).replace(/<[^>]*>/g,'').trim();
  const pause=()=>new Promise(requestAnimationFrame);

  // Read only a small indexed window of metadata at a time. Sorting by the
  // primary-key id avoids the expensive uploaded_at sort that caused the
  // original statement-timeout.
  async function getMetadataPage(afterId,pageSize){
    let query=supabaseClient
      .from('lesson_notes')
      .select('id,section,class_name,dept,term,subject,uploaded_at')
      .order('id',{ascending:true})
      .limit(pageSize);
    if(afterId!==null) query=query.gt('id',afterId);
    return query;
  }

  // Pull only the content for a small set of known IDs. If the batch still
  // triggers the database limit, fall back to one note at a time.
  async function getContentBatch(ids){
    if(!ids.length)return [];
    const first=await supabaseClient.from('lesson_notes').select('id,content').in('id',ids);
    if(!first.error)return Array.isArray(first.data)?first.data:[];
    if(ids.length===1)throw first.error;
    const rows=[];
    for(const id of ids){
      const one=await supabaseClient.from('lesson_notes').select('id,content').eq('id',id).maybeSingle();
      if(one.error)throw one.error;
      if(one.data)rows.push(one.data);
      await new Promise(r=>setTimeout(r,20));
    }
    return rows;
  }

  button.addEventListener('click',async()=>{
    button.disabled=true;
    button.textContent='Preparing…';
    if(overlay)overlay.hidden=false;
    setProgress(2,'Connecting to Supabase…','Starting…');
    try{
      const ready=await waitFor(()=>typeof supabaseClient!=='undefined',6000);
      if(!ready)throw new Error('Supabase is not ready on this page. Please refresh and try again.');

      setProgress(6,'Loading the download tools…','Preparing document generator…');
      await loadExternal(['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://unpkg.com/jszip@3.10.1/dist/jszip.min.js']);
      await loadExternal(['https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js','https://unpkg.com/html-docx-js@0.3.1/dist/html-docx.js']);
      if(!window.JSZip)throw new Error('ZIP generator failed to load.');
      if(!window.htmlDocx)throw new Error('Word document converter failed to load.');

      const PAGE_SIZE=10;
      let afterId=null;
      let page=0;
      let totalIndexed=0;
      const metadata=[];

      while(true){
        page+=1;
        const {data,error}=await getMetadataPage(afterId,PAGE_SIZE);
        if(error)throw new Error(`Could not read lesson-note records (page ${page}): ${error.message}`);
        const rows=Array.isArray(data)?data:[];
        if(!rows.length)break;
        metadata.push(...rows);
        totalIndexed+=rows.length;
        afterId=rows[rows.length-1].id;
        setProgress(10,`Reading lesson-note index…`,`Indexed ${totalIndexed} records`);
        if(rows.length<PAGE_SIZE)break;
        await pause();
      }

      if(!metadata.length){
        setProgress(100,'No saved lesson notes found.','Nothing to download.');
        if(status)status.textContent='No saved lesson notes were found.';
        return;
      }

      const zip=new JSZip();
      const selected=new Map();
      for(let start=0;start<metadata.length;start+=PAGE_SIZE){
        const metaChunk=metadata.slice(start,start+PAGE_SIZE);
        setProgress(12+Math.round((start/metadata.length)*28),`Pulling lesson-note content…`,`Records ${start+1}–${Math.min(start+metaChunk.length,metadata.length)} of ${metadata.length}`);
        const contents=await getContentBatch(metaChunk.map(row=>row.id));
        const contentById=new Map(contents.map(row=>[String(row.id),row.content]));
        for(const meta of metaChunk){
          const content=contentById.get(String(meta.id));
          if(!hasText(content))continue;
          const full={...meta,content};
          const k=key(full);
          const old=selected.get(k);
          if(!old || new Date(full.uploaded_at||0).getTime()>=new Date(old.uploaded_at||0).getTime())selected.set(k,full);
        }
        await pause();
      }

      const notes=Array.from(selected.values()).sort((a,b)=>new Date(b.uploaded_at||0)-new Date(a.uploaded_at||0));
      if(!notes.length){
        setProgress(100,'No lesson notes with content were found.','Nothing to download.');
        if(status)status.textContent='No saved lesson notes with content were found.';
        return;
      }

      for(let i=0;i<notes.length;i++){
        const row=notes[i];
        const folder=['Lesson Notes',sectionLabel(row.section),safeName(row.class_name||'Class'),row.dept?safeName(row.dept):null,safeName(row.term||'Term')].filter(Boolean).join('/');
        const subject=safeName(row.subject||'Lesson Note');
        const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject}</title></head><body>${row.content}</body></html>`;
        zip.file(`${folder}/${subject}.docx`,window.htmlDocx.asBlob(html,{orientation:'portrait',margins:{top:720,right:720,bottom:720,left:720}}));
        setProgress(40+Math.round(((i+1)/notes.length)*48),'Preparing Word documents…',`${i+1} of ${notes.length} · ${subject}`);
        await pause();
      }

      setProgress(90,'Compressing the ZIP…',`Packaging ${notes.length} Word documents…`);
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},meta=>{
        setProgress(90+Math.round(meta.percent*.10),'Finalising the ZIP…',`Compressing ${Math.round(meta.percent)}%`);
      });
      setProgress(100,'Download ready.',`${notes.length} lesson notes prepared.`);
      await new Promise(r=>setTimeout(r,250));
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`Go-Tegs-Lesson-Notes-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      if(status)status.textContent=`Done — ${notes.length} lesson notes packaged and downloaded.`;
    }catch(err){
      console.error('Lesson notes export failed:',err);
      setProgress(0,'Export failed.',err?.message||String(err));
      if(status)status.textContent='Export failed: '+(err?.message||String(err));
    }finally{
      if(overlay)overlay.hidden=true;
      button.disabled=false;
      button.textContent='↓ Download lesson notes ZIP';
    }
  });
})();
