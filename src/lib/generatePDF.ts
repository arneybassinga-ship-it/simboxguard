import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BlockingOrder, Sanction, SimAnalysis } from '../types';

const COLORS = {
  primary: [15, 23, 42] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  orange: [234, 88, 12] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightgray: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const addHeader = (doc: jsPDF, titre: string, sousTitre: string, operateur?: string) => {
  // Fond header
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, 210, 35, 'F');

  // Logo texte
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SimboxGuard', 15, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Système de détection de fraude SimBox • ARPCE Congo', 15, 20);

  // Titre rapport
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(titre, 15, 29);

  // Opérateur badge
  if (operateur) {
    const badgeColor = operateur === 'MTN' ? [234, 179, 8] as [number, number, number] : [220, 38, 38] as [number, number, number];
    doc.setFillColor(...badgeColor);
    doc.roundedRect(160, 8, 35, 10, 3, 3, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(operateur, 177.5, 14.5, { align: 'center' });
  }

  // Sous-titre et date
  doc.setTextColor(...COLORS.gray);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(sousTitre, 15, 43);
  doc.text(`Généré le ${new Date().toLocaleString('fr-FR')}`, 195, 43, { align: 'right' });

  // Ligne séparatrice
  doc.setDrawColor(...COLORS.blue);
  doc.setLineWidth(0.5);
  doc.line(15, 46, 195, 46);
};

const addFooter = (doc: jsPDF, pageNum: number, totalPages: number) => {
  const pageH = doc.internal.pageSize.height;
  doc.setDrawColor(...COLORS.lightgray[0], ...COLORS.lightgray.slice(1) as [number, number]);
  doc.setLineWidth(0.3);
  doc.line(15, pageH - 15, 195, pageH - 15);
  doc.setTextColor(...COLORS.gray);
  doc.setFontSize(7);
  doc.text('SimboxGuard • ARPCE Congo • Document confidentiel', 15, pageH - 9);
  doc.text(`Page ${pageNum} / ${totalPages}`, 195, pageH - 9, { align: 'right' });
};

// ─── RAPPORT ANALYSE CDR ────────────────────────────────────────────────────
export const generateRapportAnalyseCDR = (analyses: ReportAnalysis[], operateur: string) => {
  const doc = new jsPDF();
  addHeader(doc, 'Rapport d\'Analyse CDR', `Analyse des MSISDN suspectes détectées — ${operateur}`, operateur);

  // Résumé stats
  const critiques = analyses.filter(a => a.niveau_alerte === 'critique').length;
  const elevees = analyses.filter(a => a.niveau_alerte === 'elevee').length;
  const confirmees = analyses.filter(a => a.statut === 'confirmee').length;

  const stats = [
    { label: 'Total MSISDN analysées', value: String(analyses.length) },
    { label: 'Alertes critiques', value: String(critiques) },
    { label: 'Alertes élevées', value: String(elevees) },
    { label: 'SimBox confirmées', value: String(confirmees) },
  ];

  let y = 52;
  const boxW = 42;
  stats.forEach((s, i) => {
    const x = 15 + i * (boxW + 3);
    doc.setFillColor(...COLORS.lightgray);
    doc.roundedRect(x, y, boxW, 18, 3, 3, 'F');
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(s.value, x + boxW / 2, y + 10, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);
    doc.text(s.label, x + boxW / 2, y + 15, { align: 'center' });
  });

  y += 26;

  // Tableau
  autoTable(doc, {
    startY: y,
    head: [['MSISDN', 'Score', 'Niveau', 'Statut', 'App/h', 'Durée moy.', 'Tx échec', '% Intl']],
    body: analyses.map(a => [
      a.numero_sim,
      `${a.score_suspicion}%`,
      a.niveau_alerte.toUpperCase(),
      a.statut,
      a.criteres?.appels_par_heure ?? '-',
      a.criteres?.duree_moyenne ? `${Math.round(a.criteres.duree_moyenne)}s` : '-',
      a.criteres?.taux_echec ? `${Math.round(a.criteres.taux_echec)}%` : '-',
      a.criteres?.pct_international ? `${Math.round(a.criteres.pct_international)}%` : '-',
    ]),
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, textColor: COLORS.primary },
    alternateRowStyles: { fillColor: COLORS.lightgray },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const val = String(data.cell.raw);
        if (val === 'CRITIQUE') data.cell.styles.textColor = COLORS.red;
        else if (val === 'ELEVEE') data.cell.styles.textColor = COLORS.orange;
        else data.cell.styles.textColor = COLORS.green;
      }
    },
    margin: { left: 15, right: 15 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  doc.save(`rapport_CDR_${operateur}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ─── RAPPORT SIMBOX (pour ARPCE) ────────────────────────────────────────────
export const generateRapportSimbox = (sims: ReportAnalysis[], operateur: string, analyste: string) => {
  const doc = new jsPDF();
  addHeader(doc, 'Rapport SimBox — ARPCE', "MSISDN confirmées comme SimBox — Transmis à l'ARPCE", operateur);

  let y = 52;

  // Bloc info
  doc.setFillColor(...COLORS.lightgray);
  doc.roundedRect(15, y, 180, 22, 3, 3, 'F');
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Analyste fraude :', 20, y + 8);
  doc.text('Date de transmission :', 20, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(analyste, 65, y + 8);
  doc.text(new Date().toLocaleString('fr-FR'), 65, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text('Opérateur concerné :', 120, y + 8);
  doc.text('Nb MSISDN confirmées :', 120, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(operateur, 165, y + 8);
  doc.text(String(sims.length), 165, y + 15);

  y += 28;

  autoTable(doc, {
    startY: y,
    head: [['MSISDN', 'Score', 'App/h', 'Durée moy.', 'Tx échec', '% Nuit', '% Intl', 'Ancienneté']],
    body: sims.map(a => [
      a.numero_sim,
      `${a.score_suspicion}%`,
      a.criteres?.appels_par_heure ?? '-',
      a.criteres?.duree_moyenne ? `${Math.round(a.criteres.duree_moyenne)}s` : '-',
      a.criteres?.taux_echec ? `${Math.round(a.criteres.taux_echec)}%` : '-',
      a.criteres?.pct_nuit ? `${Math.round(a.criteres.pct_nuit)}%` : '-',
      a.criteres?.pct_international ? `${Math.round(a.criteres.pct_international)}%` : '-',
      a.criteres?.anciennete_jours ? `${a.criteres.anciennete_jours}j` : '-',
    ]),
    headStyles: { fillColor: COLORS.red, textColor: COLORS.white, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: COLORS.lightgray },
    margin: { left: 15, right: 15 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  doc.save(`rapport_simbox_${operateur}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ─── ORDRE DE BLOCAGE ────────────────────────────────────────────────────────
export const generateOrdreBlocage = (ordre: BlockingOrderReport, sims: string[]) => {
  const doc = new jsPDF();
  addHeader(doc, 'Ordre de Blocage', 'Émis par l\'ARPCE — Application immédiate requise', ordre.operateur);

  let y = 52;

  // Alerte visuelle
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(...COLORS.red);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, y, 180, 18, 3, 3, 'FD');
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`⚠ DÉLAI DE BLOCAGE : ${ordre.delai_heures}H — À compter de la réception de ce document`, 105, y + 11, { align: 'center' });

  y += 24;

  // Infos ordre
  doc.setFillColor(...COLORS.lightgray);
  doc.roundedRect(15, y, 180, 28, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  const infos = [
    ['Référence dossier', ordre.id?.slice(0, 8).toUpperCase() ?? 'N/A'],
    ['Date d\'émission', new Date(ordre.date_emission || Date.now()).toLocaleString('fr-FR')],
    ['Date limite', new Date(ordre.date_limite || Date.now()).toLocaleString('fr-FR')],
    ['Opérateur', ordre.operateur],
    ['Nombre de MSISDN', String(sims.length)],
  ];
  infos.forEach((info, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const x = 20 + col * 95;
    const iy = y + 7 + row * 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`${info[0]} :`, x, iy);
    doc.setFont('helvetica', 'normal');
    doc.text(info[1], x + 45, iy);
  });

  y += 34;

  // Liste MSISDN
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('MSISDN à bloquer immédiatement :', 15, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['#', 'MSISDN', 'Action requise', 'Délai']],
    body: sims.map((sim, i) => [
      String(i + 1),
      sim,
      'Blocage immédiat',
      `${ordre.delai_heures}h`,
    ]),
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: COLORS.lightgray },
    margin: { left: 15, right: 15 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  doc.save(`ordre_blocage_${ordre.operateur}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ─── RAPPORT SANCTION ────────────────────────────────────────────────────────
export const generateRapportSanction = (sanction: SanctionReport, operateur: string) => {
  const doc = new jsPDF();
  addHeader(doc, 'Rapport de Sanction', 'Avertissement formel — Non-respect du délai de blocage', operateur);

  let y = 52;

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(...COLORS.red);
  doc.roundedRect(15, y, 180, 40, 3, 3, 'FD');
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('AVERTISSEMENT FORMEL', 105, y + 12, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const msg = `L'opérateur ${operateur} n'a pas respecté le délai de blocage imparti. Cette sanction est enregistrée et transmise aux autorités compétentes.`;
  const lines = doc.splitTextToSize(msg, 160);
  doc.text(lines, 105, y + 22, { align: 'center' });

  y += 48;

  doc.setFillColor(...COLORS.lightgray);
  doc.roundedRect(15, y, 180, 35, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  const details = [
    ['Opérateur sanctionné', operateur],
    ['Date de sanction', new Date(sanction.date_sanction || Date.now()).toLocaleString('fr-FR')],
    ['Type', sanction.type || 'Avertissement'],
    ['Email notifié', sanction.email_envoye || '-'],
    ['Référence', sanction.id?.slice(0, 8).toUpperCase() || 'N/A'],
  ];
  details.forEach((d, i) => {
    const iy = y + 8 + i * 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`${d[0]} :`, 20, iy);
    doc.setFont('helvetica', 'normal');
    doc.text(d[1], 80, iy);
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  doc.save(`sanction_${operateur}_${new Date().toISOString().slice(0, 10)}.pdf`);
};
type ReportAnalysis = Pick<SimAnalysis, 'numero_sim' | 'score_suspicion' | 'niveau_alerte' | 'statut' | 'criteres'>;
type SanctionReport = Pick<Sanction, 'id' | 'date_sanction' | 'type'> & {
  email_envoye?: string | null;
};
type BlockingOrderReport = Pick<BlockingOrder, 'id' | 'operateur' | 'date_emission' | 'date_limite' | 'delai_heures'>;
