import { requireUser, sameOrigin } from '../../../_lib/auth.js';

const RIS_API = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-AT')
    .replace(/[^a-z0-9]/g, '');
}

function metadata(document, paths) {
  const root = document?.Data?.Metadaten || {};

  for (const path of paths) {
    let value = root;

    for (const key of path) {
      value = value?.[key];
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function documentsFrom(json) {
  const value =
    json?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;

  if (!value) return [];

  return Array.isArray(value) ? value : [value];
}

function lawNumberFrom(document) {
  const direct = metadata(document, [
    ['Bundesrecht', 'BrKons', 'Gesetzesnummer'],
    ['Bundesrecht', 'Gesetzesnummer'],
    ['Technisch', 'Gesetzesnummer']
  ]);

  if (/^\d{8}$/.test(direct)) {
    return direct;
  }

  const documentUrl = metadata(document, [
    ['Allgemein', 'DokumentUrl']
  ]);

  const match = documentUrl.match(
    /[?&]Gesetzesnummer=(\d{8})(?:&|$)/i
  );

  return match ? match[1] : '';
}

async function resolveInRis(title) {
  const url = new URL(RIS_API);

  url.searchParams.set('Applikation', 'BrKons');
  url.searchParams.set('Titel', title);
  url.searchParams.set('DokumenteProSeite', 'OneHundred');
  url.searchParams.set('Seitennummer', '1');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('RIS HTTP ' + response.status);
  }

  const json = await response.json();

  if (json?.OgdSearchResult?.Error) {
    throw new Error('RIS-Suche fehlgeschlagen');
  }

  const requestedTitle = normalize(title);
  const matches = new Map();

  for (const document of documentsFrom(json)) {
    const risTitle = metadata(document, [
      ['Bundesrecht', 'Titel'],
      ['Bundesrecht', 'Kurztitel'],
      ['Bundesrecht', 'BrKons', 'Titel']
    ]);

    const shortTitle = metadata(document, [
      ['Bundesrecht', 'Kurztitel']
    ]);

    const exactTitleMatch =
      normalize(risTitle) === requestedTitle;

    const exactShortTitleMatch =
      normalize(shortTitle) === requestedTitle;

    if (!exactTitleMatch && !exactShortTitleMatch) {
      continue;
    }

    const risNumber = lawNumberFrom(document);

    if (!risNumber) {
      continue;
    }

    const canonicalUrl = new URL(
      'https://www.ris.bka.gv.at/GeltendeFassung.wxe'
    );

    canonicalUrl.searchParams.set(
      'Abfrage',
      'Bundesnormen'
    );

    canonicalUrl.searchParams.set(
      'Gesetzesnummer',
      risNumber
    );

    if (!matches.has(risNumber)) {
      matches.set(risNumber, {
        id: risNumber,
        risNumber,
        title: risTitle || shortTitle || title,
        risUrl: canonicalUrl.href
      });
    }
  }

  if (matches.size !== 1) {
    return null;
  }

  return [...matches.values()][0];
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return respond({
      error: 'Ungültiger Ursprung.'
    }, 403);
  }

  const auth = await requireUser(request, env);

  if (auth.error) {
    return auth.error;
  }

  if (!env.COLLECTIONS_DB) {
    return respond({
      error: 'D1-Binding COLLECTIONS_DB fehlt.'
    }, 503);
  }

  const contentType =
    request.headers.get('content-type') || '';

  if (
    !contentType
      .toLowerCase()
      .includes('application/json')
  ) {
    return respond({
      error: 'JSON erforderlich.'
    }, 415);
  }

  let input;

  try {
    const raw = await request.text();

    if (raw.length > 2000) {
      return respond({
        error: 'Eingabe zu groß.'
      }, 413);
    }

    input = JSON.parse(raw);
  } catch {
    return respond({
      error: 'Ungültiges JSON.'
    }, 400);
  }

  const title = input?.title;

  if (
    typeof title !== 'string' ||
    title.trim() !== title ||
    title.length < 1 ||
    title.length > 160
  ) {
    return respond({
      error: 'Kein gültiger Vorschriftentitel übergeben.'
    }, 400);
  }

  let law;

  try {
    law = await resolveInRis(title);
  } catch (error) {
    console.error(
      'RIS-Prüfung beim Übernehmen:',
      error
    );

    return respond({
      error:
        'RIS konnte nicht geprüft werden. ' +
        'Nichts wurde gespeichert.'
    }, 503);
  }

  if (!law) {
    return respond({
      error:
        'Keine eindeutig zuordenbare RIS-Vorschrift gefunden. ' +
        'Der Treffer wurde nicht übernommen.'
    }, 422);
  }

  const userId = auth.me?.id;

  if (!userId) {
    return respond({
      error: 'Benutzer konnte nicht ermittelt werden.'
    }, 401);
  }

  try {
    await env.COLLECTIONS_DB.batch([
      env.COLLECTIONS_DB.prepare(`
        INSERT INTO ris_laws (
          id,
          ris_number,
          title,
          ris_url,
          check_status
        )
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(ris_number) DO UPDATE SET
          title = excluded.title,
          ris_url = excluded.ris_url
      `).bind(
        law.id,
        law.risNumber,
        law.title,
        law.risUrl
      ),

      env.COLLECTIONS_DB.prepare(`
        INSERT OR IGNORE INTO personal_laws (
          user_id,
          law_id
        )
        VALUES (?, ?)
      `).bind(
        userId,
        law.id
      )
    ]);

    return respond({
      id: law.id,
      title: law.title,
      risNumber: law.risNumber,
      risUrl: law.risUrl,
      message: 'Vorschrift übernommen.'
    }, 201);
  } catch (error) {
    console.error(
      'Vorschrift im Eingangskorb speichern:',
      error
    );

    return respond({
      error:
        'Vorschrift konnte nicht gespeichert werden.'
    }, 503);
  }
}
