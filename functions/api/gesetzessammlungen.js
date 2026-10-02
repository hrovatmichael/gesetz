import defaults from '../../defaults.js';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function init(db){await db.prepare('INSERT OR IGNORE INTO collections_state (id, data, revision) VALUES (1, ?, 1)').bind(JSON.stringify(defaults)).run();}
function valid(groups){
 if(!groups||typeof groups!=='object'||Array.isArray(groups))return false;
 const keys=Object.keys(groups);if(keys.length>100)return false;
 return keys.every(k=>k.trim()===k&&k.length>=1&&k.length<=80&&!['__proto__','constructor','prototype'].includes(k)&&Array.isArray(groups[k])&&groups[k].length<=250&&groups[k].every(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&x[0].trim()===x[0]&&x[0].length>=1&&x[0].length<=160&&typeof x[1]==='string'&&x[1].length<=40));
}
async function authorized(request,secret){
 if(typeof secret!=='string'||secret.length<32)return false;
 const provided=request.headers.get('Authorization')||'';
 const expected='Bearer '+secret;
 const enc=new TextEncoder();const a=enc.encode(provided),b=enc.encode(expected);
 if(a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export async function onRequestGet({env}){
 if(!env.COLLECTIONS_DB)return respond({error:'D1-Binding COLLECTIONS_DB fehlt'},503);
 try{await init(env.COLLECTIONS_DB);const row=await env.COLLECTIONS_DB.prepare('SELECT data, revision FROM collections_state WHERE id=1').first();return respond({groups:JSON.parse(row.data),revision:row.revision});}
 catch(e){return respond({error:'D1 nicht bereit: Schema pruefen'},503)}
}
export async function onRequestPut({request,env}){
 if(!env.COLLECTIONS_DB)return respond({error:'D1-Binding COLLECTIONS_DB fehlt'},503);
 if(!await authorized(request,env.COLLECTIONS_ADMIN_TOKEN))return respond({error:'Admin-Schluessel fehlt oder ist ungueltig'},401);
 const type=request.headers.get('Content-Type')||'';if(!type.toLowerCase().includes('application/json'))return respond({error:'JSON erforderlich'},415);
 const raw=await request.text();if(raw.length>120000)return respond({error:'Liste zu gross'},413);
 let input;try{input=JSON.parse(raw)}catch{return respond({error:'Ungueltiges JSON'},400)}
 if(!valid(input.groups)||!Number.isSafeInteger(input.revision)||input.revision<1)return respond({error:'Ungueltige Sammlung oder Revision'},400);
 try{
  await init(env.COLLECTIONS_DB);
  const result=await env.COLLECTIONS_DB.prepare('UPDATE collections_state SET data=?, revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(input.groups),input.revision).run();
  if(result.meta?.changes!==1)return respond({error:'Zwischenzeitlich geaendert: bitte neu laden'},409);
  return respond({revision:input.revision+1});
 }catch{return respond({error:'Speichern in D1 fehlgeschlagen'},503)}
}
