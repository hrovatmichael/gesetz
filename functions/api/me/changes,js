import { requireUser, json } from '../../_lib/auth.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

function cleanTitle(value) {
  return String(value || '')
    .replace(/&lt;\/?br\s*\/?&gt;/gi, ' ')
    .replace(/<\/?br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function changeLabel(type) {
  if (type === 'added') return 'Neu hinzugefügt';
  if (type === 'removed') return 'Entfernt';
  if (type === 'modified') return 'Geändert';
  return 'Unbekannt';
}

function groupRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = String(row.check_id);

    if (!groups.has(key)) {
      groups.set(key, {
        checkId: row.check_id,
        collectionId: row.collection_id,
        collectionName: row.collection_name,
        lawId: row.law_id,
        title: cleanTitle(row.law_title),
        risNumber: row.ris_number,
        risUrl: row.ris_url,
        detectedAt: row.detected_at,
        checkedAt: row.checked_at,
        changeCount: 0,
        addedCount: 0,
        removedCount: 0,
        modifiedCount: 0,
        items: []
      });
    }

    const group = groups.get(key);
    group.items.push({
      id: row.change_id,
      type: row.change_type,
      typeLabel: changeLabel(row.change_type),
      provisionKey: row.provision_key,
      provisionTitle: cleanTitle(row.provision_title || row.provision_key),
      previousHash: row.previous_hash,
      currentHash: row.current_hash,
      previousText: row.previous_text,
      currentText: row.current_text,
      detectedAt: row.detected_at
    });

    group.changeCount++;
    if (row.change_type === 'added') group.addedCount++;
    if (row.change_type === 'removed') group.removedCount++;
    if (row.change_type === 'modified') group.modifiedCount++;

    if (String(row.detected_at || '') > String(group.detectedAt || '')) {
      group.detectedAt = row.detected_at;
    }
  }

  return [...groups.values()];
}

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  if (!env.COLLECTIONS_DB) {
    return json({ error: 'D1-Binding COLLECTIONS_DB fehlt.' }, 503);
  }

  const userId = auth.me?.id;
  if (!userId) {
    return json({ error: 'Benutzer konnte nicht ermittelt werden.' }, 401);
  }

  const url = new URL(request.url);
  const collectionId = String(url.searchParams.get('collectionId') || '').trim();
  const lawId = String(url.searchParams.get('lawId') || '').trim();
  const checkId = String(url.searchParams.get('checkId') || '').trim();
  const limit = positiveInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT);

  if (collectionId.length > 120 || lawId.length > 160) {
    return json({ error: 'Ungültiger Filter.' }, 400);
  }

  if (checkId && !/^\d+$/.test(checkId)) {
    return json({ error: 'Ungültige checkId.' }, 400);
  }

  try {
    const conditions = ['pci.user_id = ?'];
    const filterBindings = [userId];

    if (collectionId) {
      conditions.push('pci.collection_id = ?');
      filterBindings.push(collectionId);
    }

    if (lawId) {
      conditions.push('pci.law_id = ?');
      filterBindings.push(lawId);
    }

    if (checkId) {
      conditions.push('pci.check_id = ?');
      filterBindings.push(Number(checkId));
    }

    const result = await env.COLLECTIONS_DB.prepare(`
      WITH selected_checks AS (
        SELECT
          pci.check_id,
          MAX(pci.detected_at) AS latest_detected_at
        FROM personal_law_change_items AS pci
        WHERE ${conditions.join(' AND ')}
        GROUP BY pci.check_id
        ORDER BY latest_detected_at DESC, pci.check_id DESC
        LIMIT ?
      )
      SELECT
        pci.id AS change_id,
        pci.check_id,
        pci.collection_id,
        pc.name AS collection_name,
        pci.law_id,
        rl.title AS law_title,
        rl.ris_number,
        rl.ris_url,
        pci.change_type,
        pci.provision_key,
        pci.provision_title,
        pci.previous_hash,
        pci.current_hash,
        pci.previous_text,
        pci.current_text,
        pci.detected_at,
        plc.checked_at
      FROM selected_checks AS sc
      JOIN personal_law_change_items AS pci
        ON pci.check_id = sc.check_id
       AND pci.user_id = ?
      JOIN personal_collections AS pc
        ON pc.id = pci.collection_id
       AND pc.user_id = pci.user_id
      JOIN ris_laws AS rl
        ON rl.id = pci.law_id
      LEFT JOIN personal_law_checks AS plc
        ON plc.id = pci.check_id
       AND plc.user_id = pci.user_id
      ORDER BY
        sc.latest_detected_at DESC,
        pci.check_id DESC,
        CASE pci.change_type
          WHEN 'modified' THEN 1
          WHEN 'added' THEN 2
          WHEN 'removed' THEN 3
          ELSE 4
        END,
        pci.provision_key COLLATE NOCASE
    `).bind(...filterBindings, limit, userId).all();

    const changes = groupRows(result.results || []);

    const summary = changes.reduce((totals, group) => {
      totals.checks++;
      totals.changeItems += group.changeCount;
      totals.added += group.addedCount;
      totals.removed += group.removedCount;
      totals.modified += group.modifiedCount;
      return totals;
    }, {
      checks: 0,
      changeItems: 0,
      added: 0,
      removed: 0,
      modified: 0
    });

    return json({
      changes,
      summary,
      filters: {
        collectionId: collectionId || null,
        lawId: lawId || null,
        checkId: checkId ? Number(checkId) : null,
        limit
      }
    });
  } catch (error) {
    console.error('Gesetzesänderungen laden:', error);
    return json({ error: 'Gesetzesänderungen konnten nicht geladen werden.' }, 503);
  }
}
