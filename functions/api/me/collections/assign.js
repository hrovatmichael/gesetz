import { requireUser, sameOrigin } from '../../../_lib/auth.js';

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

  const userId = auth.me.id;
  const lawId = String(
    input?.lawId || ''
  ).trim();

  const collectionId = String(
    input?.collectionId || ''
  ).trim();

  if (!lawId || !collectionId) {
    return respond(
      {
        error:
          'lawId und collectionId erforderlich.'
      },
      400
    );
  }

  try {

    const collection =
      await env.COLLECTIONS_DB
        .prepare(`
          SELECT id
          FROM personal_collections
          WHERE id = ?
            AND user_id = ?
        `)
        .bind(
          collectionId,
          userId
        )
        .first();

    if (!collection) {
      return respond(
        {
          error:
            'Sammlung nicht gefunden.'
        },
        404
      );
    }

    await env.COLLECTIONS_DB
      .prepare(`
        INSERT OR IGNORE INTO
        personal_collection_laws
        (
          user_id,
          collection_id,
          law_id
        )
        VALUES (?, ?, ?)
      `)
      .bind(
        userId,
        collectionId,
        lawId
      )
      .run();

    return respond({
      success: true
    });

  } catch (error) {

    console.error(
      'assign.js',
      error
    );

    return respond(
      {
        error:
          'Zuordnung konnte nicht gespeichert werden.'
      },
      503
    );
  }
}
