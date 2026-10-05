import { requireUser, sameOrigin, json } from '../../_lib/auth.js';

const MAX_NAME_LENGTH = 80;

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  const userId = auth.me.id;

  try {
    const collectionsResult = await env.COLLECTIONS_DB.prepare(`
      SELECT
        c.id,
        c.name,
        c.created_at,
        COALESCE(v.is_expanded, 0) AS is_expanded
      FROM personal_collections AS c
      LEFT JOIN personal_collection_view AS v
        ON v.collection_id = c.id
       AND v.user_id = c.user_id
      WHERE c.user_id = ?
      ORDER BY c.created_at ASC, c.name ASC
    `).bind(userId).all();

    const lawsResult = await env.COLLECTIONS_DB.prepare(`
      SELECT
        pcl.collection_id,
        l.id,
        l.title,
        l.ris_number,
        l.ris_url,
        l.last_checked_at,
        l.check_status,
        l.amendment_date
      FROM personal_collection_laws AS pcl
      JOIN personal_collections AS c
        ON c.id = pcl.collection_id
       AND c.user_id = pcl.user_id
      JOIN ris_laws AS l
        ON l.id = pcl.law_id
      WHERE pcl.user_id = ?
      ORDER BY l.title COLLATE NOCASE
    `).bind(userId).all();

    const inboxResult = await env.COLLECTIONS_DB.prepare(`
      SELECT
        l.id,
        l.title,
        l.ris_number,
        l.ris_url,
        l.last_checked_at,
        l.check_status,
        l.amendment_date
      FROM personal_laws AS pl
      JOIN ris_laws AS l
        ON l.id = pl.law_id
      WHERE pl.user_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM personal_collection_laws AS pcl
          WHERE pcl.user_id = pl.user_id
            AND pcl.law_id = pl.law_id
        )
      ORDER BY l.title COLLATE NOCASE
    `).bind(userId).all();

    const collections = (collectionsResult.results || []).map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      isExpanded: row.is_expanded === 1,
      laws: []
    }));

    const byId = new Map(collections.map(collection => [
      collection.id,
      collection
    ]));

    function formatLaw(row) {
      return {
        id: row.id,
        title: row.title,
        risNumber: row.ris_number,
        risUrl: row.ris_url,
        checkedAt: row.last_checked_at,
        checkStatus: row.check_status,
        amendmentDate: row.amendment_date
      };
    }

    for (const row of lawsResult.results || []) {
      const collection = byId.get(row.collection_id);
      if (collection) collection.laws.push(formatLaw(row));
    }

    return json({
      collections,
      inbox: (inboxResult.results || []).map(formatLaw)
    });
  } catch (error) {
    console.error('Persönliche Sammlungen laden:', error);
    return json({ error: 'Persönliche Sammlungen konnten nicht geladen werden.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return json({ error: 'Ungültiger Ursprung.' }, 403);
  }

  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  if (!(request.headers.get('content-type') || '')
    .toLowerCase()
    .includes('application/json')) {
    return json({ error: 'JSON erforderlich.' }, 415);
  }

  let input;

  try {
    const raw = await request.text();

    if (raw.length > 2000) {
      return json({ error: 'Eingabe zu groß.' }, 413);
    }

    input = JSON.parse(raw);
  } catch {
    return json({ error: 'Ungültiges JSON.' }, 400);
  }

  const name = input?.name;

  if (
    typeof name !== 'string' ||
    name.trim() !== name ||
    name.length < 1 ||
    name.length > MAX_NAME_LENGTH
  ) {
    return json({ error: 'Ungültiger Sammlungsname.' }, 400);
  }

  const id = crypto.randomUUID();
  const userId = auth.me.id;

  try {
    await env.COLLECTIONS_DB.prepare(`
      INSERT INTO personal_collections (id, user_id, name)
      VALUES (?, ?, ?)
    `).bind(id, userId, name).run();

    return json({ id, name }, 201);
  } catch (error) {
    console.error('Persönliche Sammlung anlegen:', error);

    const existing = await env.COLLECTIONS_DB.prepare(`
      SELECT id
      FROM personal_collections
      WHERE user_id = ? AND name = ?
    `).bind(userId, name).first().catch(() => null);

    if (existing) {
      return json({ error: 'Diese Sammlung ist bereits vorhanden.' }, 409);
    }

    return json({ error: 'Sammlung konnte nicht angelegt werden.' }, 503);
  }
}
