import { requireUser, sameOrigin } from '../../../../_lib/auth.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function respond(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: HEADERS
    }
  );
}

export async function onRequestPost({
  request,
  env
}) {

  if (!sameOrigin(request)) {
    return respond(
      { error: 'Ungültiger Ursprung.' },
      403
    );
  }

  const auth = await requireUser(
    request,
    env
  );

  if (auth.error) {
    return auth.error;
  }

  if (!env.COLLECTIONS_DB) {
    return respond(
      {
        error:
          'D1-Binding COLLECTIONS_DB fehlt.'
      },
      503
    );
  }

  let input;

  try {
    input = await request.json();
  } catch {
    return respond(
      { error: 'Ungültiges JSON.' },
      400
    );
  }

  const lawId = String(
    input?.lawId || ''
  ).trim();

  if (!lawId) {
    return respond(
      { error: 'lawId fehlt.' },
      400
    );
  }

  try {

    await env.COLLECTIONS_DB.batch([

      env.COLLECTIONS_DB.prepare(`
        DELETE FROM personal_laws
        WHERE user_id = ?
          AND law_id = ?
      `).bind(
        auth.me.id,
        lawId
      ),

      env.COLLECTIONS_DB.prepare(`
        DELETE FROM personal_collection_laws
        WHERE user_id = ?
          AND law_id = ?
      `).bind(
        auth.me.id,
        lawId
      )

    ]);

    return respond({
      success: true
    });

  } catch (error) {

    console.error(
      'remove inbox law',
      error
    );

    return respond(
      {
        error:
          'Vorschrift konnte nicht gelöscht werden.'
      },
      503
    );
  }
}
