import { requireUser, sameOrigin, json } from '../../../_lib/auth.js';

export async function onRequestDelete({ request, env, params }) {

  if (!sameOrigin(request)) {
    return json(
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

  const userId = auth.me.id;
  const collectionId =
    String(params.id || '').trim();

  if (!collectionId) {
    return json(
      { error: 'Ungültige Sammlung.' },
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

      return json(
        {
          error:
            'Sammlung nicht gefunden.'
        },
        404
      );
    }

    await env.COLLECTIONS_DB.batch([

      env.COLLECTIONS_DB
        .prepare(`
          DELETE FROM
            personal_collection_laws
          WHERE collection_id = ?
            AND user_id = ?
        `)
        .bind(
          collectionId,
          userId
        ),

      env.COLLECTIONS_DB
        .prepare(`
          DELETE FROM
            personal_collection_view
          WHERE collection_id = ?
            AND user_id = ?
        `)
        .bind(
          collectionId,
          userId
        ),

      env.COLLECTIONS_DB
        .prepare(`
          DELETE FROM
            personal_law_checks
          WHERE collection_id = ?
            AND user_id = ?
        `)
        .bind(
          collectionId,
          userId
        ),

      env.COLLECTIONS_DB
        .prepare(`
          DELETE FROM
            personal_collections
          WHERE id = ?
            AND user_id = ?
        `)
        .bind(
          collectionId,
          userId
        )

    ]);

    return json({
      success: true,
      deleted: collectionId
    });

  } catch (error) {

    console.error(
      'Sammlung löschen:',
      error
    );

    return json(
      {
        error:
          'Sammlung konnte nicht gelöscht werden.'
      },
      503
    );
  }
}
