import { requireUser, sameOrigin } from '../../../_lib/auth.js';

const RIS_API = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';
const MAX_LAWS_PER_RUN = 100;

const RIS_DOCUMENT_HOSTS = new Set([
  'www.ris.bka.gv.at',
  'ris.bka.gv.at',
  'ogd.ris.bka.gv.at'
]);

const MAX_TEXT_PER_PROVISION = 60000;

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPath(object, path) {
  let value = object;
  for (const key of path) value = value?.[key];
  return value;
}

function firstText(object, paths) {
  for (const path of paths) {
    const value = asText(getPath(object, path));
    if (value) return value;
  }
  return '';
}

function documentsFrom(json) {
  const value = json?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/br>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(value) {
  const input = asText(value);
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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  if (value && typeof value === 'object') {
    return '{' + Object.keys(value)
      .sort()
      .map(key => JSON.stringify(key) + ':' + stableStringify(value[key]))
      .join(',') + '}';
  }

  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function lawNumberFrom(document) {
  const metadata = document?.Data?.Metadaten || {};

  const direct = firstText(metadata, [
    ['Bundesrecht', 'BrKons', 'Gesetzesnummer'],
    ['Bundesrecht', 'Gesetzesnummer'],
    ['Technisch', 'Gesetzesnummer']
  ]);

  if (/^\d{8}$/.test(direct)) return direct;

  const documentUrl = firstText(metadata, [['Allgemein', 'DokumentUrl']]);
  return documentUrl.match(/[?&]Gesetzesnummer=(\d{8})(?:&|$)/i)?.[1] || '';
}

function provisionKeyFrom(document, fallbackIndex) {
  const metadata = document?.Data?.Metadaten || {};

  const explicit = firstText(metadata, [
    ['Bundesrecht', 'BrKons', 'ArtikelParagraphAnlage'],
    ['Bundesrecht', 'BrKons', 'Bezeichnung'],
    ['Bundesrecht', 'BrKons', 'Paragraph'],
    ['Bundesrecht', 'BrKons', 'Artikel'],
    ['Bundesrecht', 'BrKons', 'Anlage']
  ]);

  if (explicit) return normalizeText(explicit);

  const shortInformation = firstText(metadata, [
    ['Bundesrecht', 'BrKons', 'Kurzinformation']
  ]);

  const match = shortInformation.match(
    /(?:§\s*\d+[a-z]?(?:\s+Abs\.?\s*\d+[a-z]?)?|Art(?:ikel)?\.?\s*\d+[a-z]?|Anlage\s*[\w.-]+)/i
  );

  if (match) return normalizeText(match[0]);

  const documentId = firstText(metadata, [
    ['Technisch', 'ID'],
    ['Allgemein', 'DokumentId']
  ]);

  return documentId || `Dokument ${fallbackIndex + 1}`;
}
function safeRisUrl(value) {
  try {
    const url = new URL(
      String(value || ''),
      'https://www.ris.bka.gv.at'
    );

    if (
      url.protocol !== 'https:' ||
      !RIS_DOCUMENT_HOSTS.has(
        url.hostname.toLowerCase()
      )
    ) {
      return '';
    }

    return url.href;
  } catch {
    return '';
  }
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function documentTextFromHtml(value) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        ' '
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        ' '
      )
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(p|div|li|tr|h[1-6]|section|article)>/gi,
        '\n'
      )
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function loadRisDocumentText(value) {
  const url = safeRisUrl(value);

  if (!url) {
    return {
      text: null,
      error: 'Kein gültiger RIS-Dokumentlink'
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(
        'RIS-Dokument HTTP ' + response.status
      );
    }

    const raw = await response.text();

    const contentType =
      response.headers.get('content-type') || '';

    const text = (
      /html|xml/i.test(contentType) ||
      /<[^>]+>/.test(raw.slice(0, 500))
        ? documentTextFromHtml(raw)
        : normalizeText(raw)
    ).slice(0, MAX_TEXT_PER_PROVISION);

    if (!text) {
      throw new Error(
        'RIS-Dokument enthält keinen lesbaren Text'
      );
    }

    return {
      text,
      error: null
    };
  } catch (error) {
    return {
      text: null,
      error: String(
        error?.message || error
      )
    };
  }
}
function canonicalDocument(document, index) {
  const metadata = document?.Data?.Metadaten || {};

  return {
    key: provisionKeyFrom(document, index),
    documentId: firstText(metadata, [
      ['Technisch', 'ID'],
      ['Allgemein', 'DokumentId']
    ]),
    documentUrl: firstText(metadata, [['Allgemein', 'DokumentUrl']]),
    lawNumber: lawNumberFrom(document),
    title: normalizeText(firstText(metadata, [
      ['Bundesrecht', 'Titel'],
      ['Bundesrecht', 'Kurztitel'],
      ['Bundesrecht', 'BrKons', 'Titel']
    ])),
    shortInformation: normalizeText(firstText(metadata, [
      ['Bundesrecht', 'BrKons', 'Kurzinformation']
    ])),
    effectiveFrom: normalizeDate(firstText(metadata, [
      ['Bundesrecht', 'BrKons', 'Inkrafttretensdatum'],
      ['Bundesrecht', 'Inkrafttretensdatum']
    ])),
    effectiveTo: normalizeDate(firstText(metadata, [
      ['Bundesrecht', 'BrKons', 'Ausserkrafttretensdatum'],
      ['Bundesrecht', 'Ausserkrafttretensdatum']
    ])),
    publishedAt: normalizeDate(firstText(metadata, [
      ['Allgemein', 'Veroeffentlicht']
    ])),
    changedAt: normalizeDate(firstText(metadata, [
      ['Allgemein', 'Geaendert']
    ]))
  };
}

async function fetchRisDocumentsOnce(risNumber) {
  const url = new URL(RIS_API);
  url.searchParams.set('Applikation', 'BrKons');
  url.searchParams.set('Gesetzesnummer', risNumber);
  url.searchParams.set('DokumenteProSeite', 'OneHundred');
  url.searchParams.set('Seitennummer', '1');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`RIS HTTP ${response.status}`);
  }

  const json = await response.json();

  if (json?.OgdSearchResult?.Error) {
    throw new Error(String(
      json.OgdSearchResult.Error.Message || 'RIS-Suche fehlgeschlagen'
    ));
  }

  return documentsFrom(json);
}

async function buildMetadataSnapshot(risNumber) {
  const sourceDocuments = await fetchRisDocumentsOnce(risNumber);

  const documents = sourceDocuments
    .map((document, index) => canonicalDocument(document, index))
    .filter(document => !document.lawNumber || document.lawNumber === risNumber);

  if (!documents.length) {
    throw new Error('Keine passenden RIS-Dokumente gefunden');
  }

  const duplicateCounter = new Map();
  const provisions = {};
  const dates = [];

  for (const document of documents) {
    const duplicateNumber = duplicateCounter.get(document.key) || 0;
    duplicateCounter.set(document.key, duplicateNumber + 1);

    const key = duplicateNumber === 0
      ? document.key
      : `${document.key} [${document.documentId || duplicateNumber + 1}]`;

    const documentUrl =
  safeRisUrl(document.documentUrl);

const textResult =
  await loadRisDocumentText(documentUrl);

const metadataState = {
  documentId:
    document.documentId || null,
  documentUrl:
    documentUrl || null,
  title:
    document.title || null,
  shortInformation:
    document.shortInformation || null,
  effectiveFrom:
    document.effectiveFrom || null,
  effectiveTo:
    document.effectiveTo || null,
  publishedAt:
    document.publishedAt || null,
  changedAt:
    document.changedAt || null
};

const comparisonState = {
  metadata: metadataState,
  text: textResult.text
};

provisions[key] = {
  key,
  title:
    document.title ||
    document.shortInformation ||
    key,
  hash:
    await sha256(
      stableStringify(comparisonState)
    ),
  text: textResult.text,
  textError: textResult.error,
  metadata: metadataState
};

    dates.push(
      document.changedAt,
      document.publishedAt,
      document.effectiveFrom,
      document.effectiveTo
    );
  }

 const snapshot = {
  schemaVersion: 3,
  snapshotType: 'ris-text',
  risNumber,
  limitedToFirstPage:
    sourceDocuments.length === 100,
  provisions
};

  const snapshotJson = JSON.stringify(snapshot);

  return {
    snapshot,
    snapshotJson,
    fingerprint: await sha256(stableStringify(provisions)),
    documentCount: Object.keys(provisions).length,
    latestDate: dates.map(normalizeDate).filter(Boolean).sort().at(-1) || null,
    limitedToFirstPage: sourceDocuments.length === 100
  };
}

function parseSnapshot(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && parsed.provisions && typeof parsed.provisions === 'object'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function compareSnapshots(previousSnapshot, currentSnapshot) {
  const previous = previousSnapshot?.provisions || {};
  const current = currentSnapshot?.provisions || {};
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .sort((a, b) => a.localeCompare(b, 'de-AT'));

  const changes = [];

  for (const key of keys) {
    const before = previous[key];
    const after = current[key];

    if (!before && after) {
  changes.push({
    changeType: 'added',
    provisionKey: key,
    provisionTitle: after.title || key,
    previousHash: null,
    currentHash: after.hash,
    previousText: null,
    currentText: after.text || null
  });
} else if (before && !after) {
  changes.push({
    changeType: 'removed',
    provisionKey: key,
    provisionTitle: before.title || key,
    previousHash: before.hash,
    currentHash: null,
    previousText: before.text || null,
    currentText: null
  });
} else if (before.hash !== after.hash) {
  changes.push({
    changeType: 'modified',
    provisionKey: key,
    provisionTitle:
      after.title ||
      before.title ||
      key,
    previousHash: before.hash,
    currentHash: after.hash,
    previousText: before.text || null,
    currentText: after.text || null
  });
}
  }

  return changes;
}

async function latestSnapshot(db, userId, collectionId, lawId) {
  return db.prepare(`
    SELECT id, check_id, fingerprint, snapshot_json, created_at
    FROM personal_law_snapshots
    WHERE user_id = ?
      AND collection_id = ?
      AND law_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).bind(userId, collectionId, lawId).first();
}

async function insertCheck(db, values) {
  const result = await db.prepare(`
    INSERT INTO personal_law_checks (
      user_id,
      collection_id,
      law_id,
      status,
      previous_fingerprint,
      current_fingerprint,
      checked_at,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    values.userId,
    values.collectionId,
    values.lawId,
    values.status,
    values.previousFingerprint,
    values.currentFingerprint,
    values.checkedAt,
    values.errorMessage
  ).run();

  const checkId = result.meta?.last_row_id;

  if (!Number.isInteger(checkId)) {
    throw new Error('Prüf-ID konnte nicht ermittelt werden');
  }

  return checkId;
}

async function saveSuccessfulCheck(db, values) {
  const checkId = await insertCheck(db, {
    userId: values.userId,
    collectionId: values.collectionId,
    lawId: values.law.id,
    status: values.status,
    previousFingerprint: values.previous?.fingerprint || null,
    currentFingerprint: values.current.fingerprint,
    checkedAt: values.checkedAt,
    errorMessage: values.warning || null
  });

  const statements = [
    db.prepare(`
      UPDATE ris_laws
      SET ris_fingerprint = ?,
          last_checked_at = ?,
          check_status = ?,
          amendment_date = CASE
            WHEN ? IS NOT NULL THEN ?
            ELSE amendment_date
          END
      WHERE id = ?
    `).bind(
      values.current.fingerprint,
      values.checkedAt,
      values.status === 'changed' ? 'changed' : 'complete',
      values.amendmentDate,
      values.amendmentDate,
      values.law.id
    ),
    db.prepare(`
      INSERT INTO personal_law_snapshots (
        id,
        check_id,
        user_id,
        collection_id,
        law_id,
        fingerprint,
        snapshot_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      checkId,
      values.userId,
      values.collectionId,
      values.law.id,
      values.current.fingerprint,
      values.current.snapshotJson,
      values.checkedAt
    )
  ];

  for (const change of values.changes) {
    statements.push(db.prepare(`
      INSERT INTO personal_law_change_items (
        check_id,
        user_id,
        collection_id,
        law_id,
        change_type,
        provision_key,
        provision_title,
        previous_hash,
        current_hash,
        previous_text,
        current_text,
        detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
  checkId,
  values.userId,
  values.collectionId,
  values.law.id,
  change.changeType,
  change.provisionKey,
  change.provisionTitle,
  change.previousHash,
  change.currentHash,
  change.previousText,
  change.currentText,
  values.checkedAt
));
  }

  await db.batch(statements);
  return checkId;
}

async function saveFailedCheck(db, values) {
  const checkId = await insertCheck(db, {
    userId: values.userId,
    collectionId: values.collectionId,
    lawId: values.law.id,
    status: 'error',
    previousFingerprint: values.previous?.fingerprint || null,
    currentFingerprint: null,
    checkedAt: values.checkedAt,
    errorMessage: values.errorMessage.slice(0, 500)
  });

  await db.prepare(`
    UPDATE ris_laws
    SET last_checked_at = ?, check_status = 'error'
    WHERE id = ?
  `).bind(values.checkedAt, values.law.id).run();

  return checkId;
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

  if (!(request.headers.get('content-type') || '')
    .toLowerCase()
    .includes('application/json')) {
    return respond({ error: 'JSON erforderlich.' }, 415);
  }

  let input;

  try {
    const raw = await request.text();
    if (raw.length > 2000) {
      return respond({ error: 'Eingabe zu groß.' }, 413);
    }
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

  if (!userId) {
    return respond({ error: 'Benutzer konnte nicht ermittelt werden.' }, 401);
  }

  try {
    const collection = await db.prepare(`
      SELECT id, name
      FROM personal_collections
      WHERE id = ? AND user_id = ?
    `).bind(collectionId, userId).first();

    if (!collection) {
      return respond({ error: 'Sammlung nicht gefunden.' }, 404);
    }

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
      errors: 0,
      changeItems: 0,
      limitedSnapshots: 0
    };

    const results = [];

    for (const law of laws) {
      const checkedAt = new Date().toISOString();
      let previous = null;

      try {
        if (!/^\d{8}$/.test(String(law.ris_number || ''))) {
          throw new Error('Ungültige oder fehlende RIS-Gesetzesnummer');
        }

        previous = await latestSnapshot(db, userId, collectionId, law.id);
        const current = await buildMetadataSnapshot(law.ris_number);
        const previousParsed = previous
          ? parseSnapshot(previous.snapshot_json)
          : null;

        if (previous && !previousParsed) {
          throw new Error('Vorheriger Snapshot ist beschädigt oder nicht lesbar');
        }

        const previousComparable =
  previousParsed?.snapshotType === 'ris-text'
    ? previousParsed
    : null;

        const changes = previousComparable
          ? compareSnapshots(previousComparable, current.snapshot)
          : [];

        let status;
        let amendmentDate = null;

        if (!previousComparable) {
          status = 'baseline';
          summary.baseline++;
        } else if (changes.length === 0) {
          status = 'unchanged';
          summary.unchanged++;
        } else {
          status = 'changed';
          amendmentDate = current.latestDate || checkedAt.slice(0, 10);
          summary.changed++;
          summary.changeItems += changes.length;
        }

        if (current.limitedToFirstPage) {
          summary.limitedSnapshots++;
        }

        const warning = current.limitedToFirstPage
          ? 'Snapshot umfasst nur die ersten 100 RIS-Dokumente.'
          : null;

        const checkId = await saveSuccessfulCheck(db, {
          userId,
          collectionId,
          law,
          previous,
          current,
          status,
          checkedAt,
          amendmentDate,
          changes,
          warning
        });

        results.push({
          checkId,
          lawId: law.id,
          risNumber: law.ris_number,
          title: normalizeText(law.title),
          status,
          checkedAt,
          amendmentDate,
          documentCount: current.documentCount,
          limitedToFirstPage: current.limitedToFirstPage,
          changeCount: changes.length,
          changes: changes.map(change => ({
            type: change.changeType,
            provisionKey: change.provisionKey,
            provisionTitle: change.provisionTitle
          }))
        });
      } catch (error) {
        const errorMessage = String(error?.message || error || 'Prüfungsfehler');
        summary.errors++;

        try {
          await saveFailedCheck(db, {
            userId,
            collectionId,
            law,
            previous,
            checkedAt,
            errorMessage
          });
        } catch (saveFailure) {
          console.error('Prüffehler konnte nicht gespeichert werden:', saveFailure);
        }

        results.push({
          lawId: law.id,
          risNumber: law.ris_number,
          title: normalizeText(law.title),
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
