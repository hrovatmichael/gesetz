import { requireUser, sameOrigin } from '../../../_lib/auth.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
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

  const auth =
    await requireUser(request, env);

  if (auth.error) {
    return auth.error;
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

  try {

    await env.COLLECTIONS_DB
      .prepare(`
        DELETE FROM
          personal_collection_laws
        WHERE
          user_id = ?
          AND collection_id = ?
          AND law_id = ?
      `)
      .bind(
        auth.me.id,
        input.collectionId,
        input.lawId
      )
      .run();

    return respond({
      success: true
    });

  } catch {

    return respond(
      {
        error:
          'Zuordnung konnte nicht entfernt werden.'
      },
      503
    );
  }
}
