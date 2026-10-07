import {
  requireUser,
  sameOrigin
} from '../../../_lib/auth.js';

const RIS_API =
  'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';

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

function clean(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function at(object, path) {
  let value = object;

  for (const key of path) {
    value = value?.[key];
  }

  return typeof value === 'string'
    ? value.trim()
    : '';
}

function first(object, paths) {
  for (const path of paths) {
    const value = at(object, path);

    if (value) {
      return value;
    }
  }

  return '';
}

function docs(json) {
  const value =
    json?.OgdSearchResult
      ?.OgdDocumentResults
      ?.OgdDocumentReference;

  if (!value) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
}

function number(document) {
  const metadata =
    document?.Data?.Metadaten || {};

  const direct = first(metadata, [
    ['Bundesrecht', 'BrKons', 'Gesetzesnummer'],
    ['Bundesrecht', 'Gesetzesnummer'],
    ['Technisch', 'Gesetzesnummer']
  ]);

  if (/^\d{8}$/.test(direct)) {
    return direct;
  }

  const documentUrl = first(metadata, [
    ['Allgemein', 'DokumentUrl']
  ]);

  return documentUrl.match(
    /[?&]Gesetzesnummer=(\d{8})(?:&|$)/i
  )?.[1] || '';
}

function normalizeDate(value) {
  const text = clean(value);
  let match;

  if (
    (match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(text))
  ) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  if (
    (match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text))
  ) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return '';
}

function todayInAustria() {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: 'Europe/Vienna',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function candidate(document) {
  const metadata =
    document?.Data?.Metadaten || {};

  const risNumber = number(document);

  if (!risNumber) {
    return null;
  }

  const title = clean(first(metadata, [
    ['Bundesrecht', 'Titel'],
    ['Bundesrecht', 'Kurztitel'],
    ['Bundesrecht', 'BrKons', 'Titel']
  ]));

  const shortTitle = clean(first(metadata, [
    ['Bundesrecht', 'Kurztitel'],
    ['Bundesrecht', 'BrKons', 'Kurztitel']
  ]));

  const effectiveFrom = normalizeDate(
    first(metadata, [
      ['Bundesrecht', 'BrKons', 'Inkrafttretensdatum'],
      ['Bundesrecht', 'Inkrafttretensdatum']
    ])
  );

  const effectiveTo = normalizeDate(
    first(metadata, [
      ['Bundesrecht', 'BrKons', 'Ausserkrafttretensdatum'],
      ['Bundesrecht', 'Ausserkrafttretensdatum']
    ])
  );

  const changedAt = normalizeDate(
    first(metadata, [
      ['Allgemein', 'Geaendert']
    ])
  );

  const today = todayInAustria();

  const isFuture
