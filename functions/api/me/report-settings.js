import { requireUser, sameOrigin, json } from '../../_lib/auth.js';

const DEFAULT_HOUR = 6;

function sanitizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  if (!env.COLLECTIONS_DB) {
    return json(
      { error: 'D1-Binding COLLECTIONS_DB fehlt.' },
      503
    );
  }

  try {
    const row =
      await env.COLLECTIONS_DB
        .prepare(`
          SELECT
            email,
            daily_enabled,
            send_hour
          FROM report_settings
          WHERE user_id = ?
        `)
        .bind(auth.me.id)
        .first();

    return json({
      email: row?.email || '',
      dailyEnabled:
        Number(row?.daily_enabled || 0) === 1,
      sendHour:
        Number.isInteger(row?.send_hour)
          ? row.send_hour
          : DEFAULT_HOUR
    });

  } catch (error) {

    console.error(
      'Report Settings laden:',
      error
    );

    return json(
      {
        error:
          'Report-Einstellungen konnten nicht geladen werden.'
      },
      503
    );
  }
}

export async function onRequestPost({ request, env }) {

  if (!sameOrigin(request)) {
    return json(
      { error: 'Ungültiger Ursprung.' },
      403
    );
  }

  const auth =
    await requireUser(
      request,
      env
    );

  if (auth.error) {
    return auth.error;
  }

  if (!env.COLLECTIONS_DB) {
    return json(
      {
        error:
          'D1-Binding COLLECTIONS_DB fehlt.'
      },
      503
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {

    return json(
      {
        error:
          'Ungültiges JSON.'
      },
      400
    );
  }

  const email =
    sanitizeEmail(
      body?.email
    );

  const dailyEnabled =
    Boolean(
      body?.dailyEnabled
    );

  const sendHour =
    Math.max(
      0,
      Math.min(
        23,
        parseInt(
          body?.sendHour ?? DEFAULT_HOUR,
          10
        ) || DEFAULT_HOUR
      )
    );

  if (!validEmail(email)) {
    return json(
      {
        error:
          'Ungültige E-Mail-Adresse.'
      },
      400
    );
  }

  try {

    await env.COLLECTIONS_DB
      .prepare(`
        INSERT INTO report_settings (
          user_id,
          email,
          daily_enabled,
          send_hour
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET
          email = excluded.email,
          daily_enabled = excluded.daily_enabled,
          send_hour = excluded.send_hour
      `)
      .bind(
        auth.me.id,
        email,
        dailyEnabled ? 1 : 0,
        sendHour
      )
      .run();

    return json({
      success: true,
      email,
      dailyEnabled,
      sendHour
    });

  } catch (error) {

    console.error(
      'Report Settings speichern:',
      error
    );

    return json(
      {
        error:
          'Report-Einstellungen konnten nicht gespeichert werden.'
      },
      503
    );
  }
}
