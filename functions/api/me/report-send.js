import {
  requireUser,
  sameOrigin,
  json
} from '../../_lib/auth.js';

const VIENNA_TIME_ZONE = 'Europe/Vienna';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<\/?br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRecipients(value) {
  try {
    const recipients = JSON.parse(
      String(value || '[]')
    );

    if (!Array.isArray(recipients)) {
      return [];
    }

    return [
      ...new Set(
        recipients
          .map(email =>
            String(email || '')
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      )
    ];
  } catch {
    return [];
  }
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || '')
  );
}

function viennaDateKey(value = new Date()) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: VIENNA_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    ).formatToParts(value);

  const values =
    Object.fromEntries(
      parts.map(part => [
        part.type,
        part.value
      ])
    );

  return (
    values.year +
    '-' +
    values.month +
    '-' +
    values.day
  );
}

function formatViennaDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    'de-AT',
    {
      timeZone: VIENNA_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  ).format(date);
}

function isFromToday(value, todayKey) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return viennaDateKey(date) === todayKey;
}

function changeLabel(type) {
  if (type === 'added') {
    return 'Neu hinzugefügt';
  }

  if (type === 'removed') {
    return 'Entfernt';
  }

  if (type === 'modified') {
    return 'Geändert';
  }

  return 'Unbekannte Änderung';
}

async function sendEmail({
  env,
  recipients,
  subject,
  html
}) {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      'Cloudflare Secret RESEND_API_KEY fehlt.'
    );
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        from:
          'Rechtsmonitor <onboarding@resend.dev>',
        to: recipients,
        subject,
        html
      })
    }
  );

  const responseText =
    await response.text();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
      result?.error?.message ||
      responseText ||
      'Resend-Versand fehlgeschlagen.'
    );
  }

  return result;
}

async function loadReportData(
  db,
  userId
) {
  const todayKey =
    viennaDateKey();

  const since =
    new Date(
      Date.now() -
      48 * 60 * 60 * 1000
    ).toISOString();

  const checksResult =
    await db.prepare(`
      SELECT
        plc.id,
        plc.collection_id,
        plc.law_id,
        plc.status,
        plc.checked_at,
        plc.error_message,
        pc.name AS collection_name,
        rl.title AS law_title,
        rl.ris_number,
        rl.ris_url
      FROM personal_law_checks AS plc
      JOIN personal_collections AS pc
        ON pc.id = plc.collection_id
       AND pc.user_id = plc.user_id
      JOIN ris_laws AS rl
        ON rl.id = plc.law_id
      WHERE plc.user_id = ?
        AND plc.checked_at >= ?
      ORDER BY
        plc.checked_at DESC,
        plc.id DESC
    `)
      .bind(
        userId,
        since
      )
      .all();

  const changesResult =
    await db.prepare(`
      SELECT
        pci.id,
        pci.check_id,
        pci.collection_id,
        pci.law_id,
        pci.change_type,
        pci.provision_key,
        pci.detected_at,
        pc.name AS collection_name,
        rl.title AS law_title,
        rl.ris_number,
        rl.ris_url
      FROM personal_law_change_items AS pci
      JOIN personal_collections AS pc
        ON pc.id = pci.collection_id
       AND pc.user_id = pci.user_id
      JOIN ris_laws AS rl
        ON rl.id = pci.law_id
      WHERE pci.user_id = ?
        AND pci.detected_at >= ?
      ORDER BY
        pci.detected_at DESC,
        pci.id DESC
    `)
      .bind(
        userId,
        since
      )
      .all();

  const checks =
    (checksResult.results || [])
      .filter(row =>
        isFromToday(
          row.checked_at,
          todayKey
        )
      );

  const changes =
    (changesResult.results || [])
      .filter(row =>
        isFromToday(
          row.detected_at,
          todayKey
        )
      );

  const collectionIds =
    new Set();

  const lawIds =
    new Set();

  const summary = {
    checks: checks.length,
    collections: 0,
    laws: 0,
    baseline: 0,
    unchanged: 0,
    changed: 0,
    errors: 0,
    changeItems: changes.length,
    added: 0,
    removed: 0,
    modified: 0
  };

  for (const check of checks) {
    collectionIds.add(
      check.collection_id
    );

    lawIds.add(
      check.law_id
    );

    if (check.status === 'baseline') {
      summary.baseline++;
    }

    if (check.status === 'unchanged') {
      summary.unchanged++;
    }

    if (check.status === 'changed') {
      summary.changed++;
    }

    if (check.status === 'error') {
      summary.errors++;
    }
  }

  summary.collections =
    collectionIds.size;

  summary.laws =
    lawIds.size;

  for (const change of changes) {
    if (change.change_type === 'added') {
      summary.added++;
    }

    if (change.change_type === 'removed') {
      summary.removed++;
    }

    if (change.change_type === 'modified') {
      summary.modified++;
    }
  }

  return {
    checks,
    changes,
    summary
  };
}

function buildChangedSections(changes) {
  const groups = new Map();

  for (const change of changes) {
    const key =
      String(change.check_id) +
      '|' +
      String(change.law_id);

    if (!groups.has(key)) {
      groups.set(key, {
        title:
          cleanText(
            change.law_title
          ) ||
          'Ohne Titel',

        collectionName:
          cleanText(
            change.collection_name
          ),

        risNumber:
          cleanText(
            change.ris_number
          ),

        risUrl:
          String(
            change.ris_url || ''
          ),

        detectedAt:
          change.detected_at,

        items: []
      });
    }

    groups.get(key).items.push({
      type:
        change.change_type,

      provisionKey:
        cleanText(
          change.provision_key
        )
    });
  }

  return [...groups.values()]
    .map(group => {
      const items =
        group.items
          .map(item => `
            <li style="margin-bottom:6px">
              <strong>
                ${escapeHtml(
                  changeLabel(item.type)
                )}
              </strong>:
              ${escapeHtml(
                item.provisionKey ||
                'Unbekannte Bestimmung'
              )}
            </li>
          `)
          .join('');

      const risLink =
        /^https:\/\//i.test(group.risUrl)
          ? `
            <p style="margin-top:12px">
              ${escapeHtml(group.risUrl)}
                Vorschrift im RIS öffnen
              </a>
            </p>
          `
          : '';

      return `
        <div style="
          margin-top:18px;
          padding:16px;
          border:1px solid #d8e1e5;
          border-radius:10px;
          background:#f8fafb;
        ">
          <h3 style="margin:0 0 8px">
            ${escapeHtml(group.title)}
          </h3>

          <p style="margin:4px 0">
            <strong>Sammlung:</strong>
            ${escapeHtml(
              group.collectionName ||
              'Keine Angabe'
            )}
          </p>

          <p style="margin:4px 0">
            <strong>RIS-Nummer:</strong>
            ${escapeHtml(
              group.risNumber ||
              'Keine Angabe'
            )}
          </p>

          <p style="margin:4px 0 10px">
            <strong>Erkannt:</strong>
            ${escapeHtml(
              formatViennaDateTime(
                group.detectedAt
              )
            )}
          </p>

          <ul>
            ${items}
          </ul>

          ${risLink}
        </div>
      `;
    })
    .join('');
}

function buildErrorList(checks) {
  return checks
    .filter(check =>
      check.status === 'error'
    )
    .map(check => `
      <li>
        ${escapeHtml(
          cleanText(
            check.law_title
          ) ||
          'Unbekannte Vorschrift'
        )}

        ${
          check.error_message
            ? ': ' +
              escapeHtml(
                cleanText(
                  check.error_message
                )
              )
            : ''
        }
      </li>
    `)
    .join('');
}

function buildReportHtml(report) {
  const generatedAt =
    formatViennaDateTime(
      new Date().toISOString()
    );

  const changedSections =
    buildChangedSections(
      report.changes
    );

  const errorList =
    buildErrorList(
      report.checks
    );

  return `
    <!doctype html>

    <html lang="de">
      <head>
        <meta charset="utf-8">
      </head>

      <body style="
        margin:0;
        padding:24px;
        background:#f3f6f8;
        color:#142a3a;
        font-family:Arial,sans-serif;
      ">
        <div style="
          max-width:760px;
          margin:auto;
          padding:24px;
          background:#ffffff;
          border:1px solid #dce5e9;
          border-radius:14px;
        ">
          <h1 style="margin-top:0">
            Rechtsmonitor Österreich
          </h1>

          <p>
            Tagesbericht vom
            ${escapeHtml(generatedAt)}
          </p>

          <table
            cellpadding="9"
            cellspacing="0"
            style="
              width:100%;
              border-collapse:collapse;
              margin-top:20px;
            "
          >
            <tr>
              <td style="border:1px solid #dce5e9">
                Sammlungen geprüft
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.collections}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Vorschriften geprüft
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.laws}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Referenzstände gespeichert
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.baseline}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Unverändert
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.unchanged}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Vorschriften mit Änderungen
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.changed}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Einzeländerungen
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.changeItems}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Neu hinzugefügt
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.added}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Entfernt
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.removed}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Geändert
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.modified}
              </td>
            </tr>

            <tr>
              <td style="border:1px solid #dce5e9">
                Prüfungsfehler
              </td>

              <td style="border:1px solid #dce5e9">
                ${report.summary.errors}
              </td>
            </tr>
          </table>

          ${
            report.summary.changeItems > 0
              ? `
                <h2 style="margin-top:26px">
                  Erkannte Änderungen
                </h2>

                ${changedSections}
              `
              : `
                <div style="
                  margin-top:24px;
                  padding:15px;
                  background:#edf7f2;
                  border-radius:10px;
                  color:#205d48;
                ">
                  Es wurden heute keine Änderungen erkannt.
                </div>
              `
          }

          ${
            errorList
              ? `
                <h2 style="margin-top:26px">
                  Prüfungsfehler
                </h2>

                <ul>
                  ${errorList}
                </ul>
              `
              : ''
          }

          <p style="
            margin-top:28px;
            color:#667b87;
            font-size:12px;
          ">
            Dieser Bericht wurde vom Rechtsmonitor
            Österreich erstellt. Verbindlich ist der
            jeweilige Originaltext im
            Rechtsinformationssystem des Bundes.
          </p>
        </div>
      </body>
    </html>
  `;
}

export async function onRequestPost({
  request,
  env
}) {
  if (!sameOrigin(request)) {
    return json(
      {
        error:
          'Ungültiger Ursprung.'
      },
      403
    );
  }

  const auth =
    await requireUser(
      request,
      env,
      'admin'
    );

  if (auth.error) {
    return auth.error;
  }

  if (!env.COLLECTIONS_DB) {
    return json(
      {
        error:
          'D1-Binding COLLECTIONS_DB fehlt.'
      },
      503
    );
  }

  try {
    const settings =
      await env.COLLECTIONS_DB
        .prepare(`
          SELECT
            recipients,
            send_when_empty
          FROM report_settings
          WHERE user_id = ?
        `)
        .bind(
          auth.me.id
        )
        .first();

    if (!settings) {
      return json(
        {
          error:
            'Bitte zuerst die Tagesbericht-Einstellungen speichern.'
        },
        404
      );
    }

    const recipients =
      parseRecipients(
        settings.recipients
      );

    if (!recipients.length) {
      return json(
        {
          error:
            'Es sind keine Empfänger eingetragen.'
        },
        400
      );
    }

    const invalidRecipient =
      recipients.find(email =>
        !validEmail(email)
      );

    if (invalidRecipient) {
      return json(
        {
          error:
            'Ungültiger Empfänger: ' +
            invalidRecipient
        },
        400
      );
    }

    const report =
      await loadReportData(
        env.COLLECTIONS_DB,
        auth.me.id
      );

    const subject =
      report.summary.changeItems > 0
        ? (
            'Rechtsmonitor: ' +
            report.summary.changeItems +
            ' Änderung(en) erkannt'
          )
        : (
            'Rechtsmonitor: Tagesprüfung ohne Änderungen'
          );

    const html =
      buildReportHtml(
        report
      );

    const resendResult =
      await sendEmail({
        env,
        recipients,
        subject,
        html
      });

    return json({
      success: true,
      recipients,
      resendMessageId:
        resendResult.id || null,
      summary:
        report.summary
    });

  } catch (error) {
    console.error(
      'Tagesbericht manuell senden:',
      error
    );

    return json(
      {
        error:
          String(
            error?.message ||
            error ||
            'Tagesbericht konnte nicht versendet werden.'
          )
      },
      503
    );
  }
}
