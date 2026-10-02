import {
  db, json, body, sameOrigin, usernameOk,
  passwordOk, random, hashPassword
} from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return json({ error: 'Ungültiger Ursprung' }, 403);
  }

  if (!db(env)) {
    return json({ error: 'D1-Binding fehlt' }, 503);
  }

  try {
    if (!env.ADMIN_BOOTSTRAP_TOKEN ||
        env.ADMIN_BOOTSTRAP_TOKEN.length < 6) {
      return json({ error: 'ADMIN_BOOTSTRAP_TOKEN fehlt' }, 503);
    }

    const x = await body(request);

    if (!usernameOk(x.username) ||
        !passwordOk(x.password) ||
        x.token !== env.ADMIN_BOOTSTRAP_TOKEN) {
      return json({ error: 'Ungültige Angaben' }, 400);
    }

    const salt = random(16);
    const hash = await hashPassword(x.password, salt);

    const result = await db(env)
      .prepare(
        "INSERT INTO users(id, username, role, salt, password_hash) " +
        "SELECT ?, ?, 'admin', ?, ? " +
        "WHERE NOT EXISTS (SELECT 1 FROM users)"
      )
      .bind(crypto.randomUUID(), x.username, salt, hash)
      .run();

    return result.meta.changes === 1
      ? json({ ok: true })
      : json({ error: 'Einrichtung bereits abgeschlossen' }, 409);
  } catch (e) {
    console.error('Admin-Bootstrap fehlgeschlagen:', e);
    return json({ error: 'Admin-Einrichtung fehlgeschlagen' }, 503);
  }
}
