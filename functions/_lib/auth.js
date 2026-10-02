export const db=env=>env.COLLECTIONS_DB;
export const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
const hex=a=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
const unhex=s=>new Uint8Array(s.match(/../g).map(x=>parseInt(x,16)));
export const random=n=>hex(bytes(n));
export async function sha(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))}
export async function hashPassword(password,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:210000,hash:'SHA-256'},k,256)))}
export async function verify(password,salt,expected){const actual=await hashPassword(password,salt);let diff=actual.length^expected.length;for(let i=0;i<Math.min(actual.length,expected.length);i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0}
export function sameOrigin(request){const origin=request.headers.get('Origin');return !!origin&&origin===new URL(request.url).origin}
export async function body(request){if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))throw Error('JSON erforderlich');const text=await request.text();if(text.length>160000)throw Error('Eingabe zu groß');return JSON.parse(text)}
export const usernameOk=x=>typeof x==='string'&&/^[a-zA-Z0-9._-]{3,40}$/.test(x);
export const passwordOk=x=>typeof x==='string'&&x.length>=12&&x.length<=200;
export async function user(request,env){if(!db(env))return null;const token=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)rm_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return await db(env).prepare('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(await sha(token),Date.now()).first()}
export async function requireUser(request,env,role){if(!db(env))return {error:json({error:'D1-Binding COLLECTIONS_DB fehlt'},503)};const me=await user(request,env);return me&&(!role||me.role===role)?{me}:{error:json({error:'Anmeldung oder Berechtigung erforderlich'},401)}}
export const cookie=(token,age)=>`rm_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export const failure=e=>json({error:String(e?.message||e)},400);
