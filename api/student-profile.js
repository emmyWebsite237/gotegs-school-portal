import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BUCKET = 'student-profile-pics';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp']);

function tableFor(section){
  return section === 'sss_students' ? 'sss_students' : section === 'jss_students' ? 'jss_students' : null;
}
function clean(v,max=120){return String(v??'').trim().slice(0,max);}
async function findStudent(supabase, studentId, pin, sectionHint){
  const tables = sectionHint === 'sss_students' ? ['sss_students','jss_students'] : sectionHint === 'jss_students' ? ['jss_students','sss_students'] : ['jss_students','sss_students'];
  for (const table of tables) {
    const q = await supabase.from(table).select('id,student_id,profile_pic_path').eq('student_id',studentId).eq('pin',pin).maybeSingle();
    if (q.error) {
      if (String(q.error.message||'').toLowerCase().includes('profile_pic_path')) {
        const fallback = await supabase.from(table).select('id,student_id').eq('student_id',studentId).eq('pin',pin).maybeSingle();
        if (fallback.error) throw fallback.error;
        if (fallback.data) return {...fallback.data, profile_pic_path:null, section:table};
        continue;
      }
      throw q.error;
    }
    if (q.data) return {...q.data, section:table};
  }
  return null;
}
async function signedUrl(supabase,path){
  if(!path) return null;
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,60*60*24*7);
  if(error) return null;
  return data?.signedUrl || null;
}
function extensionFor(mime,name){
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const safe = clean(name,100).toLowerCase();
  const fromName = safe.match(/\.(jpg|jpeg|png|webp)$/)?.[1];
  return fromName === 'jpeg' ? 'jpg' : fromName || ext;
}

export default async function handler(req,res){
  try{
    if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({error:'Server misconfigured: Supabase environment variables are missing.'});
    if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed.'});
    const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);

    if(req.method==='GET'){
      const {student_id,pin,section}=req.query||{};
      if(!student_id||!pin) return res.status(400).json({error:'Student ID and PIN are required.'});
      const student=await findStudent(supabase,clean(student_id,80),String(pin),tableFor(section));
      if(!student) return res.status(404).json({error:'Student ID or PIN not recognized.'});
      const url=await signedUrl(supabase,student.profile_pic_path);
      return res.status(200).json({has_profile_pic:!!student.profile_pic_path,profile_pic_url:url,section:student.section});
    }

    let input=req.body;
    if(typeof input==='string'){try{input=JSON.parse(input);}catch{input={};}}
    input=input||{};
    const studentId=clean(input.student_id,80),pin=String(input.pin||''),section=tableFor(input.section);
    if(!studentId||!pin) return res.status(400).json({error:'Student ID and PIN are required.'});
    if(!section) return res.status(400).json({error:'Invalid student section.'});
    const mime=String(input.mime_type||'').toLowerCase();
    if(!ALLOWED.has(mime)) return res.status(400).json({error:'Use a JPG, PNG or WebP image.'});
    const encoded=String(input.data||'').replace(/^data:[^;]+;base64,/,'').trim();
    if(!encoded) return res.status(400).json({error:'No image was selected.'});
    let buffer;
    try{buffer=Buffer.from(encoded,'base64');}catch{buffer=null;}
    if(!buffer||!buffer.length||buffer.length>MAX_BYTES) return res.status(400).json({error:'Profile picture must be smaller than 2 MB.'});

    const student=await findStudent(supabase,studentId,pin,section);
    if(!student) return res.status(404).json({error:'Student ID or PIN not recognized.'});
    const actualSection=student.section;
    const oldPath=student.profile_pic_path||null;
    const ext=extensionFor(mime,input.file_name||'profile');
    const safeId=studentId.replace(/[^a-zA-Z0-9_-]/g,'_');
    const path=`${actualSection}/${safeId}-${randomUUID()}.${ext}`;

    const upload=await supabase.storage.from(BUCKET).upload(path,buffer,{contentType:mime,upsert:false,cacheControl:'3600'});
    if(upload.error) return res.status(400).json({error:'Could not upload profile picture: '+upload.error.message});

    let update=await supabase.from(actualSection).update({profile_pic_path:path}).eq('id',student.id);
    if(update.error){try{await supabase.storage.from(BUCKET).remove([path]);}catch(_){}return res.status(400).json({error:'Profile picture storage is not configured yet. Run the student profile-picture SQL migration.'});}
    if(oldPath&&oldPath!==path){try{await supabase.storage.from(BUCKET).remove([oldPath]);}catch(_){} }
    const url=await signedUrl(supabase,path);
    return res.status(200).json({success:true,profile_pic_url:url,section:actualSection});
  }catch(err){
    console.error('student-profile error:',err);
    return res.status(500).json({error:'Server error: '+err.message});
  }
}
