import { createClient } from '@supabase/supabase-js';

const BUCKET='student-profile-pics';

async function getProfilePathAndUrl(supabase, table, studentId, pin){
  const q=await supabase.from(table).select('profile_pic_path').eq('student_id',studentId).eq('pin',pin).maybeSingle();
  if(q.error){
    if(String(q.error.message||'').toLowerCase().includes('profile_pic_path')) return {path:null,url:null};
    throw q.error;
  }
  const path=q.data?.profile_pic_path||null;
  if(!path) return {path:null,url:null};
  const signed=await supabase.storage.from(BUCKET).createSignedUrl(path,60*60*24*7);
  return {path,url:signed.error?null:(signed.data?.signedUrl||null)};
}

export default async function handler(req,res){
  try{
    if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({error:"Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables."});
    const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {student_id,pin}=req.query||{};
    if(!student_id||!pin) return res.status(400).json({error:'Missing Student ID or PIN.'});

    let student=null,section=null;
    const {data:jssMatch,error:jssError}=await supabase.from('jss_students').select('full_name,class,student_id').eq('student_id',student_id).eq('pin',pin).maybeSingle();
    if(jssError) throw jssError;
    if(jssMatch){student=jssMatch;section='jss_students';}
    else{
      const {data:sssMatch,error:sssError}=await supabase.from('sss_students').select('full_name,class,dept,student_id').eq('student_id',student_id).eq('pin',pin).maybeSingle();
      if(sssError) throw sssError;
      if(sssMatch){student=sssMatch;section='sss_students';}
    }
    if(!student) return res.status(404).json({error:'Student ID or PIN not recognized.'});

    const {data:settings,error:settingsError}=await supabase.from('admin_portal').select('year').order('id',{ascending:true}).limit(1).maybeSingle();
    if(settingsError||!settings?.year) return res.status(503).json({error:'The school year has not been configured by the admin yet.'});

    const profile=await getProfilePathAndUrl(supabase,section,student_id,pin);
    return res.status(200).json({full_name:student.full_name,class:student.class,dept:student.dept||null,year:settings.year,section,profile_pic_url:profile.url,has_profile_pic:!!profile.path});
  }catch(err){
    console.error('student-login error:',err);
    return res.status(500).json({error:'Server error: '+err.message});
  }
}
