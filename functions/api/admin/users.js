import {db,json,body,sameOrigin,requireUser,usernameOk,passwordOk,random,hashPassword} from '../../_lib/auth.js';
export async function onRequestGet({request,env}){try{const a=await requireUser(request,env,'admin');if(a.error)return a.error;const r=await db(env).prepare('SELECT id,username,role,active,created_at FROM users ORDER BY username').all();return json({users:r.results})}catch{return json({error:'Datenbankfehler'},503)}}
export async function onRequestPost({request,env}){if(!sameOrigin(request))return json({error:'Ungültiger Ursprung'},403);try{const a=await requireUser(request,env,'admin');if(a.error)return a.error;const x=await body(request);if(!usernameOk(x.username)||!passwordOk(x.password)||!['user','admin'].includes(x.role))return json({error:'Benutzername, Rolle oder Passwort ungültig'},400);const salt=random(16);await db(env).prepare('INSERT INTO users(id,username,role,salt,password_hash) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),x.username,x.role,salt,await hashPassword(x.password,salt)).run();return json({ok:true},201)}catch{return json({error:'Nutzer konnte nicht angelegt werden (Name eventuell vergeben)'},409)}}
export async function onRequestPatch({request,env}){if(!sameOrigin(request))return json({error:'Ungültiger Ursprung'},403);try{const a=await requireUser(request,env,'admin');if(a.error)return a.error;const x=await body(request);if(typeof x.id!=='string'||typeof x.active!=='boolean'||x.id===a.me.id)return json({error:'Ungültige Änderung oder eigenes Konto'},400);const target=await db(env).prepare('SELECT role,active FROM users WHERE id=?').bind(x.id).first();if(!target)return json({error:'Nutzer fehlt'},404);if(target.role==='admin'&&target.active&& !x.active){const count=await db(env).prepare("SELECT count(*) AS n FROM users WHERE role='admin' AND active=1").first();if(count.n<=1)return json({error:'Letzter Admin darf nicht deaktiviert werden'},409)}await db(env).prepare('UPDATE users SET active=? WHERE id=?').bind(x.active?1:0,x.id).run();if(!x.active)await db(env).prepare('DELETE FROM sessions WHERE user_id=?').bind(x.id).run();return json({ok:true})}catch{return json({error:'Änderung fehlgeschlagen'},503)}}
export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) {
    return json({ error: 'Ungültiger Ursprung' }, 403);
  }

  try {
    const a = await requireUser(request, env, 'admin');

    if (a.error) return a.error;

    const x = await body(request);

    if (typeof x.id !== 'string' || x.id === a.me.id) {
      return json({ error: 'Ungültiger Benutzer' }, 400);
    }

    await db(env)
      .prepare('DELETE FROM sessions WHERE user_id=?')
      .bind(x.id)
      .run();

    await db(env)
      .prepare('DELETE FROM users WHERE id=?')
      .bind(x.id)
      .run();

    return json({ ok: true });
  } catch {
    return json({ error: 'Benutzer konnte nicht gelöscht werden' }, 503);
  }
}
