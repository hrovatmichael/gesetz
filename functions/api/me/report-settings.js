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

  try {

    const row =
      await env.COLLECTIONS_DB
        .prepare(`
          SELECT
            recipients,
            daily_enabled,
            send_hour,
            send_when_empty
          FROM report_settings
          WHERE user_id = ?
        `)
        .bind(auth.me.id)
        .first();

    return json({
      recipients:
        JSON.parse(
          row?.recipients || '[]'
        ),
      dailyEnabled:
        Number(
          row?.daily_enabled || 0
        ) === 1,
      sendWhenEmpty:
        Number(
          row?.send_when_empty || 0
        ) === 1,
      sendHour:
        Number.isInteger(
          row?.send_hour
        )
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

export async function onRequestPost({
  request,
  env
}) {

  if (!sameOrigin(request)) {

    return json(
      {
        error:
          'Ungültiger Ursprung.'
      },
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

    body =
      await request.json();

  } catch {

    return json(
      {
        error:
          'Ungültiges JSON.'
      },
      400
    );
  }

  const recipients =
    Array.isArray(
      body?.recipients
    )
      ? body.recipients
          .map(
            sanitizeEmail
          )
          .filter(Boolean)
      : [];

  const dailyEnabled =
    Boolean(
      body?.dailyEnabled
    );

  const sendWhenEmpty =
    Boolean(
      body?.sendWhenEmpty
    );

  const sendHour =
    Math.max(
      0,
      Math.min(
        23,
        parseInt(
          body?.sendHour ??
          DEFAULT_HOUR,
          10
        ) || DEFAULT_HOUR
      )
    );

  if (!recipients.length) {

    return json(
      {
        error:
          'Mindestens ein Empfänger erforderlich.'
      },
      400
    );
  }

  for (const email of recipients) {

    if (!validEmail(email)) {

      return json(
        {
          error:
            'Ungültige E-Mail-Adresse: ' +
            email
        },
        400
      );
    }
  }

  try {

    await env.COLLECTIONS_DB
      .prepare(`
        INSERT INTO report_settings (
          user_id,
          recipients,
          daily_enabled,
          send_hour,
          send_when_empty
        )
        VALUES (?, ?, ?, ?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET
          recipients = excluded.recipients,
          daily_enabled = excluded.daily_enabled,
          send_hour = excluded.send_hour,
          send_when_empty = excluded.send_when_empty,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        auth.me.id,
        JSON.stringify(
          recipients
        ),
        dailyEnabled ? 1 : 0,
        sendHour,
        sendWhenEmpty ? 1 : 0
      )
      .run();

    return json({
      success: true,
      recipients,
      dailyEnabled,
      sendWhenEmpty,
      sendHour
    });

  } catch (error) {

    console.error(
      'Report Settings speichern:',
      error
    );

    return json(
  {
    error: String(
      error?.message || error
    )
  },
  503
);
  }
}
