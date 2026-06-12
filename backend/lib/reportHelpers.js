import { v4 as uuidv4 } from 'uuid';

export const REPORT_STATUSES   = ['brouillon', 'envoye', 'consulte', 'traite'];
export const REPORT_ROLES      = ['analyste', 'arpce', 'analyste_fraude', 'agent_mtn', 'agent_airtel'];
export const REPORT_DESTINATIONS = ['arpce', 'agent_mtn', 'agent_airtel'];

export const toSqlDateTime = (date = new Date()) =>
  date.toISOString().slice(0, 19).replace('T', ' ');

export const buildReportReference = () =>
  `RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;

export const parseJsonField = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

export const normalizeAnalysesForReport = (rows) =>
  rows.map((row) => ({ ...row, criteres: parseJsonField(row.criteres, row.criteres) }));

export const buildReportContent = ({
  type, operateur, reference, analysteNom,
  periodeDebut, periodeFin, analyses, dateSignature = null,
}) => {
  const base = {
    reference, operateur, total: analyses.length,
    analyste_nom: analysteNom,
    periode: { date_debut: periodeDebut, date_fin: periodeFin },
    signature: { analyste_nom: analysteNom, date_signature: dateSignature },
    date_generation: new Date().toISOString(),
  };
  if (type === 'simbox') {
    return { ...base, titre: `Rapport SimBox — ${operateur}`, sims_confirmees: analyses };
  }
  return { ...base, titre: `Analyse CDR — ${operateur}`, analyses };
};

export const normalizeReportRow = (row) => {
  const contenu = parseJsonField(row.contenu_json, {});
  const signatureDate = row.date_signature
    ? new Date(row.date_signature).toISOString()
    : contenu.signature?.date_signature || null;
  return {
    ...row,
    contenu_json: {
      ...contenu,
      reference: row.reference_unique || contenu.reference || null,
      signature: {
        analyste_nom: row.analyste_nom || contenu.signature?.analyste_nom || contenu.analyste_nom || null,
        date_signature: signatureDate,
      },
      periode: {
        date_debut: row.periode_debut || contenu.periode?.date_debut || null,
        date_fin: row.periode_fin   || contenu.periode?.date_fin   || null,
      },
    },
  };
};
