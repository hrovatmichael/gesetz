import { requireUser, sameOrigin } from '../../../_lib/auth.js';

const RIS_API = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';
const MAX_LAWS_PER_RUN = 100;
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const respond = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: HEADERS });

const text = value => typeof value === 'string' ? value.trim() : '';

function get(object, path) {
  let value = object;
  for (const key of path) value = value?.[key];
  return value;
}

function first(object, paths) {
  for (const path of paths) {
    const value = text(get(object, path));
    if (value) return value;
  }
  return '';
}

function documentsFrom(json) {
  const value = json?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(value) {
  return String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value) {
  const input = text(value);
  let match;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input))) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  if ((match = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(input))) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(input))) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return '';
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + stable(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalDocument(document) {
  const metadata = document?.Data?.Metadaten || {};
  return {
    documentId: first(metadata, [
      ['Technisch', 'ID'],
      ['Allgemein', 'DokumentId']
    ]),
    documentUrl: first(metadata, [['Allgemein', 'DokumentUrl']]),
    lawNumber: first(metadata, [
      ['Bundesrecht', 'BrKons', 'Gesetzesnummer'],
      ['Bundesrecht', 'Gesetzesnummer'],
      ['Technisch', 'Gesetzesnummer']
    ]),
    title: first(metadata, [
      ['Bundesrecht', 'Titel'],
      ['Bundesrecht', 'Kurztitel'],
      ['Bundesrecht', 'BrKons', 'Titel']
    ]),
    shortInformation: first(metadata, [
      ['Bundesrecht', 'BrKons', 'Kurzinformation']
    ]),
    section: first(metadata, [
      ['Bundesrecht', 'BrKons', 'ArtikelParagraphAnlage'],
      ['Bundesrecht', 'BrKons', 'Abschnitt']
    ]),
    effectiveFrom: normalizeDate(first(metadata, [
      ['Bundesrecht', 'BrKons', 'Inkrafttretensdatum'],
      ['Bundesrecht', 'Inkrafttretensdatum']
    ])),
    effectiveTo: normalizeDate(first(metadata, [
      ['Bundesrecht', 'BrKons', 'Ausserkrafttretensdatum'],
      ['Bundesrecht', 'Ausserkrafttretensdatum']
    ])),
    publishedAt: normalizeDate(first(metadata, [['Allgemein', 'Veroeffentlicht']])),
    changedAt: normalizeDate(first(metadata, [['Allgemein', 'Geaendert']]))
  };
}

async function readRisState(risNumber) {
  const url = new URL(RIS_API);
  url.searchParams.set('Applikation', 'BrKons');
  url.searchParams.set('Gesetzesnummer', risNumber);
  url.searchParams.set('DokumenteProSeite', 'OneHundred');
  url.searchParams.set('Seitennummer', '1');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`RIS HTTP ${response.status}`);

  const json = await response.json();
  if (json?.OgdSearchResult?.Error) {
    throw new Error(
      String(json.OgdSearchResult.Error.Message || 'RIS-Suche fehlgeschlagen')
    );
  }

  const documents = documentsFrom(json)
    .map(canonicalDocument)
    .filter(row => !row.lawNumber || row.lawNumber === risNumber)
    .map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalize(value)])
    ))
    .sort((a, b) => stable(a).localeCompare(stable(b), 'de-AT'));

  if (!documents.length) {
    throw new Error('Keine passenden RIS-Dokumente gefunden');
  }

  const dates = documents
    .flatMap(row => [row.changedAt, row.publishedAt, row.effectiveFrom, row.effectiveTo])
    .map(normalizeDate)
    .filter(Boolean)
    .sort();

  return {
    fingerprint: await sha256(stable({ risNumber, documents })),
    latestDate: dates.at(-1) || null,
    documentCount: documents.length
  };
}

async function latestSuccessfulCheck(db, userId, collectionId, lawId) {
  return db.prepare(`
    SELECT current_fingerprint
    FROM personal_law_checks
    WHERE user_id = ?
      AND collection_id = ?
      AND law_id = ?
      AND status IN ('baseline', 'unchanged', 'changed')
      AND current_fingerprint IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  `).bind(userId, collectionId, lawId).first();
}

async function saveSuccess(db, values) {
  await db.batch([
    db.prepare(`
      UPDATE ris_laws
      SET ris_fingerprint = ?,
          last_checked_at = ?,
          check_status = ?,
          amendment_date = CASE WHEN ? IS NOT NULL THEN ? ELSE amendment_date END
      WHERE id = ?
    `).bind(
      values.currentFingerprint,
      values.checkedAt,
      values.lawStatus,
      values.amendmentDate,
      values.amendmentDate,
      values.law.id
    ),
    db.prepare(`
      INSERT INTO personal_law_checks (
        user_id, collection_id, law_id, status,
        previous_fingerprint, current_fingerprint,
        checked_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      values.userId,
      values.collectionId,
      values.law.id,
      values.historyStatus,
      values.previousFingerprint,
      values.currentFingerprint,
      values.checkedAt
    )
  ]);
}

async function saveError(db, values) {
  await db.batch([
    db.prepare(`
      UPDATE ris_laws
      SET last_checked_at = ?, check_status = 'error'
      WHERE id = ?
    `).bind(values.checkedAt, values.law.id),
    db.prepare(`
      INSERT INTO personal_law_checks (
        user_id, collection_id, law_id, status,
        previous_fingerprint, current_fingerprint,
        checked_at, error_message
      ) VALUES (?, ?, ?, 'error', NULL, NULL, ?, ?)
    `).bind(
      values.userId,
      values.collectionId,
      values.law.id,
      values.checkedAt,
      values.errorMessage.slice(0, 500)
    )
  ]);
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return respond({ error: 'Ungültiger Ursprung.' }, 403);
  }

  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  if (!env.COLLECTIONS_DB) {
    return respond({ error: 'D1-Binding COLLECTIONS_DB fehlt.' }, 503);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return respond({ error: 'JSON erforderlich.' }, 415);
  }

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 2000) return respond({ error: 'Eingabe zu groß.' }, 413);
    input = JSON.parse(raw);
  } catch {
    return respond({ error: 'Ungültiges JSON.' }, 400);
  }

  const collectionId = String(input?.collectionId || '').trim();
  if (!collectionId || collectionId.length > 120) {
    return respond({ error: 'Ungültige collectionId.' }, 400);
  }

  const db = env.COLLECTIONS_DB;
  const userId = auth.me?.id;
  if (!userId) return respond({ error: 'Benutzer konnte nicht ermittelt werden.' }, 401);

  try {
    const collection = await db.prepare(`
      SELECT id, name
      FROM personal_collections
      WHERE id = ? AND user_id = ?
    `).bind(collectionId, userId).first();

    if (!collection) return respond({ error: 'Sammlung nicht gefunden.' }, 404);

    const query = await db.prepare(`
      SELECT rl.id, rl.ris_number, rl.title, rl.ris_url
      FROM personal_collection_laws pcl
      INNER JOIN ris_laws rl ON rl.id = pcl.law_id
      WHERE pcl.user_id = ? AND pcl.collection_id = ?
      ORDER BY rl.title COLLATE NOCASE, rl.id
      LIMIT ?
    `).bind(userId, collectionId, MAX_LAWS_PER_RUN + 1).all();

    const laws = query.results || [];
    if (laws.length > MAX_LAWS_PER_RUN) {
      return respond({
        error: `Sammlung enthält mehr als ${MAX_LAWS_PER_RUN} Vorschriften.`
      }, 413);
    }

    const summary = {
      total: laws.length,
      baseline: 0,
      unchanged: 0,
      changed: 0,
      errors: 0
    };
    const results = [];

    for (const law of laws) {
      const checkedAt = new Date().toISOString();

      try {
        if (!/^\d{8}$/.test(String(law.ris_number || ''))) {
          throw new Error('Ungültige oder fehlende RIS-Gesetzesnummer');
        }

        const previous = await latestSuccessfulCheck(
          db, userId, collectionId, law.id
        );
        const current = await readRisState(law.ris_number);
        const previousFingerprint = previous?.current_fingerprint || null;

        let historyStatus;
        let lawStatus;
        let amendmentDate = null;

        if (!previousFingerprint) {
          historyStatus = 'baseline';
          lawStatus = 'complete';
          summary.baseline++;
        } else if (previousFingerprint === current.fingerprint) {
          historyStatus = 'unchanged';
          lawStatus = 'complete';
          summary.unchanged++;
        } else {
          historyStatus = 'changed';
          lawStatus = 'changed';
          amendmentDate = current.latestDate;
          summary.changed++;
        }

        await saveSuccess(db, {
          userId,
          collectionId,
          law,
          previousFingerprint,
          currentFingerprint: current.fingerprint,
          historyStatus,
          lawStatus,
          checkedAt,
          amendmentDate
        });

        results.push({
          lawId: law.id,
          risNumber: law.ris_number,
          title: law.title,
          status: historyStatus,
          checkedAt,
          amendmentDate,
          documentCount: current.documentCount
        });
      } catch (error) {
        const errorMessage = String(error?.message || error || 'Prüfungsfehler');
        summary.errors++;

        try {
          await saveError(db, {
            userId,
            collectionId,
            law,
            checkedAt,
            errorMessage
          });
        } catch (saveFailure) {
          console.error('Prüffehler konnte nicht gespeichert werden:', saveFailure);
        }

        results.push({
          lawId: law.id,
          risNumber: law.ris_number,
          title: law.title,
          status: 'error',
          checkedAt,
          error: errorMessage
        });
      }
    }

    return respond({
      success: summary.errors === 0,
      collectionId,
      collectionName: collection.name,
      checkedAt: new Date().toISOString(),
      summary,
      results
    }, laws.length > 0 && summary.errors === laws.length ? 503 : 200);
  } catch (error) {
    console.error('Sammlung mit RIS abgleichen:', error);
    return respond({
      error: 'RIS-Abgleich der Sammlung konnte nicht ausgeführt werden.'
    }, 503);
  }
}
