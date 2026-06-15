import xlsx from 'xlsx';
import multer from 'multer';

/* ========= MULTER UPLOAD ========= */

const ALLOWED_MIMES = new Set([
  'text/csv', 'application/csv', 'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_MIMES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Type de fichier non autorisé (csv, xlsx, xls uniquement)')),
});

/* ========= PARSING ========= */

export const normalizeColumnName = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');

const detectCsvDelimiter = (buffer) => {
  const sample = buffer.toString('utf8', 0, Math.min(3000, buffer.length));
  const firstLine = sample.split(/\r?\n/)[0] || '';
  const counts = {
    ',':  (firstLine.match(/,/g)  || []).length,
    ';':  (firstLine.match(/;/g)  || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|':  (firstLine.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

export const parseCdrFile = (buffer, originalname) => {
  const ext = originalname.split('.').pop().toLowerCase();
  let workbook;
  if (ext === 'csv') {
    const delimiter = detectCsvDelimiter(buffer);
    workbook = xlsx.read(buffer, { type: 'buffer', FS: delimiter });
  } else {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  }
  const sheetName = workbook.SheetNames.find(name => {
    const s = workbook.Sheets[name];
    return s && Object.keys(s).filter(k => !k.startsWith('!')).length > 2;
  }) || workbook.SheetNames[0];
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
};

export const toDateTimeString = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    if (value > 1_000_000_000) {
      const ts = value > 1_000_000_000_000 ? value : value * 1000;
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000)
        return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;
    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10}$/.test(raw)) {
    const d = new Date(Number(raw) * 1000);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000)
      return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (/^\d{13}$/.test(raw)) {
    const d = new Date(Number(raw));
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000)
      return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d, hh, mm, ss] = compactMatch;
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    let [, d, m, y, hh = '00', mm = '00', ss = '00'] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    if (!Number.isNaN(date.getTime()))
      return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  const date = new Date(raw.replace(/\//g, '-'));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

export const parseDurationSeconds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw)));
  const parts = raw.split(':').map(p => p.trim());
  if (parts.length >= 2 && parts.every(p => /^\d+$/.test(p))) {
    const nums = parts.map(Number);
    if (nums.length === 2) return (nums[0] * 60) + nums[1];
    if (nums.length === 3) return (nums[0] * 3600) + (nums[1] * 60) + nums[2];
  }
  const hourMatch = raw.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?/i);
  if (hourMatch && hourMatch[0].trim()) {
    const [, h = '0', m = '0', s = '0'] = hourMatch;
    const total = (Number(h) * 3600) + (Number(m) * 60) + Number(s);
    if (Number.isFinite(total)) return total;
  }
  return null;
};

export const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
};

/* ========= MAPPING DE COLONNES ========= */

export const CHAMPS_SYNONYMES = {
  numero_sim: [
    'msisdn','msisdn_a','a_msisdn','a_number','a_party','a_party_number',
    'calling_number','calling_party','calling_msisdn','caller','caller_id',
    'ani','cli','originating_number','originating_msisdn','originating',
    'origin_number','origine_number','imsi_msisdn',
    'numero_sim','numero_appelant','numero_a','msisdn_appelant',
    'abonnee','abonnee_a','abonne_a','abonne','subscriber',
    'sim','source','from','src','phone','numero','msisdn_source',
  ],
  numero_appele: [
    'b_number','b_msisdn','msisdn_b','b_party','b_party_number',
    'called_number','called_party','called_msisdn','called','callee',
    'dialed','dialed_number','dnis','destination','destination_number',
    'terminating','terminating_number','terminating_msisdn',
    'numero_appele','numero_appele','numero_destination','numero_b',
    'msisdn_appele','abonnee_b','abonne_b',
    'to','dst','dest','b_calling',
  ],
  date_heure: [
    'datetime','timestamp','start_time','start_datetime','call_start',
    'call_time','call_date','call_timestamp','call_begin','call_date_time',
    'event_time','begin_time','answer_time','setup_time','record_date','start','time',
    'date_heure','date_appel','heure_appel','date_debut','heure_debut',
    'date_debut_appel','debut_appel','date_et_heure','date_time','date','heure',
    'call_start_time','start_date_time','origination_time',
  ],
  duree_secondes: [
    'duration','duration_sec','duration_seconds','call_duration',
    'billsec','billed_duration','charged_duration','talk_time',
    'conversation_time','holding_time','call_length','elapsed','seconds',
    'duree_secondes','duree_sec','duree','duree_appel','duree_communication',
    'duree_facturee','duree_en_secondes','length','total_duration',
  ],
  statut_appel: [
    'status','call_status','call_result','call_state','disposition',
    'outcome','answer_status','release_cause','termination_cause',
    'release_cause_code','cause_code',
    'statut_appel','statut','etat','etat_appel','cause_fin',
    'cause_liberation','resultat','resultat_appel','result',
  ],
  origine: [
    'call_type','traffic_type','traffic','call_direction','direction',
    'service_type','call_nature','roaming_flag','in_out','traffic_case',
    'origine','nature','service','type_appel','type_trafic',
    'sens_appel','type_communication','sens','type_traffic','type',
  ],
  imei: [
    'imei','imei_a','imei_calling','imei_device','device_imei',
    'equipment_identity','mobile_equipment_id','mei','terminal_imei',
    'imei_caller','imei_source','source_imei','imei_sim',
    'identificateur_terminal','id_terminal','device_id',
  ],
};

const normaliserStatut = (val) => {
  const v = String(val ?? '').toLowerCase().trim();
  const ABOUTI = ['abouti','answered','connected','success','yes','1','ok','completed','normal','normal clearing','established','accept'];
  const ECHOUE = ['echoue','échoué','failed','unanswered','busy','no answer','noanswer','0','nok','no','rejected','error','timeout','cancel','congestion','not answered'];
  if (ABOUTI.some(a => v.includes(a))) return 'abouti';
  if (ECHOUE.some(e => v.includes(e))) return 'echoue';
  return null;
};

const normaliserOrigine = (val) => {
  const v = String(val ?? '').toLowerCase().trim();
  const INTER = ['international','inter','int','roaming','idd','foreign','abroad','overseas','transit'];
  const NAT = ['national','local','domestic','nat','loc','home','onnet','offnet','inland'];
  if (INTER.some(i => v.includes(i))) return 'international';
  if (NAT.some(n => v.includes(n))) return 'national';
  if (v === '1') return 'international';
  if (v === '0') return 'national';
  return null;
};

export const detecterMapping = (colonnes) => {
  const mapping = {};
  const normalizedColumns = colonnes.map(col => ({ original: col, normalized: normalizeColumnName(col) }));
  for (const [champ, synonymes] of Object.entries(CHAMPS_SYNONYMES)) {
    const synonymesNormalises = synonymes.map(normalizeColumnName);
    const col = normalizedColumns.find(c => synonymesNormalises.includes(c.normalized));
    mapping[champ] = col?.original || null;
  }
  return mapping;
};

const detecterOrigineDepuisNumero = (numero) => {
  const v = String(numero ?? '').replace(/\s+/g, '');
  if (!v) return null;
  if (v.startsWith('+242') || v.startsWith('242')) return 'national';
  if (v.startsWith('+') || v.startsWith('00')) return 'international';
  return 'national';
};

export const infererStatutAppel = (rawStatut, dureeSecondes) => {
  const statut = normaliserStatut(rawStatut);
  if (statut) return statut;
  if (dureeSecondes === null) return 'abouti';
  return dureeSecondes > 0 ? 'abouti' : 'echoue';
};

export const infererOrigine = (rawOrigine, numeroAppele) => {
  const origine = normaliserOrigine(rawOrigine);
  if (origine) return origine;
  return detecterOrigineDepuisNumero(numeroAppele) || 'national';
};

const normalizePhoneValue = (numero) => {
  if (numero === null || numero === undefined) return '';
  if (typeof numero === 'number' && Number.isFinite(numero)) return String(Math.trunc(numero));
  return String(numero).trim();
};

const stripPrefixCongo = (numero) =>
  normalizePhoneValue(numero)
    .replace(/[^\d+]/g, '')
    .replace(/^(\+242|00242|242)/, '')
    .replace(/^\+/, '');

export const normalizeNumeroCongo = (numero) => {
  const n = stripPrefixCongo(numero);
  if (/^[456]\d{7,10}$/.test(n)) return `0${n}`;
  return n;
};

export const isSimValide = (numero, operateur) => {
  const n = normalizeNumeroCongo(numero);
  if (operateur === 'MTN')    return /^06\d{7,10}$/.test(n);
  if (operateur === 'AIRTEL') return /^0[45]\d{7,10}$/.test(n);
  return true;
};

/* ========= PARSING IMEI ========= */

export const parseImei = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().replace(/[^\d]/g, '');
  if (!/^\d{14,16}$/.test(raw)) return null;
  return raw;
};

export const normalizeImei = (imei) => {
  const parsed = parseImei(imei);
  return parsed || null;
};

export const parseJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try { 
    const p = JSON.parse(value); 
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch { return {}; }
};