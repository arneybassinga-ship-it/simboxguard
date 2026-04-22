import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FileText, Loader2, Send, Download, Clock3, CheckCircle2, Eye } from 'lucide-react';
import { showError, showSuccess } from '../../utils/toast';
import { AnalystReport, ReportDestination, ReportStatus, User } from '../../types';
import { generateRapportAnalyseCDR, generateRapportSimbox } from '../../lib/generatePDF';
import { apiUrl } from '../../lib/api';

type ReportTab = 'brouillons' | 'arpce' | 'operateurs';

const STATUS_CONFIG: Record<ReportStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  brouillon: { label: 'Brouillon', className: 'bg-slate-500/10 text-slate-300 border-slate-500/20', icon: Clock3 },
  envoye: { label: 'Envoye', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20', icon: Send },
  consulte: { label: 'Consulte', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20', icon: Eye },
  traite: { label: 'Traite', className: 'bg-green-500/10 text-green-300 border-green-500/20', icon: CheckCircle2 },
};

const DESTINATION_OPTIONS: { value: ReportDestination; label: string }[] = [
  { value: 'arpce', label: 'ARPCE' },
  { value: 'agent_mtn', label: 'Agent MTN' },
  { value: 'agent_airtel', label: 'Agent Airtel' },
];

const getReportItems = (report: AnalystReport) =>
  report.contenu_json.sims_confirmees ?? report.contenu_json.analyses ?? [];

const Reports = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const [reports, setReports] = useState<AnalystReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState('');
  const [tab, setTab] = useState<ReportTab>('brouillons');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [operateur, setOperateur] = useState<'TOUS' | 'MTN' | 'AIRTEL'>('TOUS');
  const [destination, setDestination] = useState<ReportDestination>('arpce');

  const loadReports = () => {
    setLoading(true);
    fetch(apiUrl('/api/rapports?expediteur_role=analyste_fraude'))
      .then(r => r.json())
      .then(setReports)
      .catch(() => showError('Erreur chargement rapports analyste'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadReports(); }, []);

  useEffect(() => {
    if (destination === 'agent_mtn') setOperateur('MTN');
    if (destination === 'agent_airtel') setOperateur('AIRTEL');
  }, [destination]);

  const filteredReports = useMemo(() => reports.filter((report) => {
    if (tab === 'brouillons') return report.statut_rapport === 'brouillon';
    if (tab === 'arpce') return report.destinataire_role === 'arpce' && report.statut_rapport !== 'brouillon';
    return ['agent_mtn', 'agent_airtel'].includes(report.destinataire_role) && report.statut_rapport !== 'brouillon';
  }), [reports, tab]);

  const counts = {
    brouillons: reports.filter(r => r.statut_rapport === 'brouillon').length,
    arpce: reports.filter(r => r.destinataire_role === 'arpce' && r.statut_rapport !== 'brouillon').length,
    operateurs: reports.filter(r => ['agent_mtn', 'agent_airtel'].includes(r.destinataire_role) && r.statut_rapport !== 'brouillon').length,
  };

  const handleCreateDraft = async () => {
    if (!dateDebut || !dateFin) return showError('Choisissez une periode complete');
    if (dateDebut > dateFin) return showError('La date de debut doit etre avant la date de fin');

    setCreating(true);
    try {
      const response = await fetch(apiUrl('/api/analyste/rapports/generer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operateur,
          destinataire: destination,
          date_debut: dateDebut,
          date_fin: dateFin,
          analyste_nom: user.nom,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur generation rapport');
      setReports(prev => [data, ...prev]);
      setTab('brouillons');
      showSuccess(`Brouillon cree: ${data.reference_unique || data.contenu_json?.reference}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur generation rapport');
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (report: AnalystReport) => {
    setSendingId(report.id);
    try {
      const response = await fetch(apiUrl(`/api/rapports/${report.id}/envoyer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyste_nom: user.nom }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur envoi rapport');
      setReports(prev => prev.map(item => item.id === report.id ? data : item));
      showSuccess(`Rapport ${data.reference_unique || data.contenu_json?.reference} envoye`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur envoi rapport');
    } finally {
      setSendingId('');
    }
  };

  const handleDownload = (report: AnalystReport) => {
    const items = getReportItems(report);
    if (items.length === 0) {
      showError('Aucune donnee a exporter pour ce rapport');
      return;
    }
    if (report.destinataire_role === 'arpce') {
      generateRapportSimbox(items, report.operateur, report.analyste_nom || user.nom);
      return;
    }
    generateRapportAnalyseCDR(items, report.operateur);
  };

  return (
    <DashboardLayout title="Rapports Analyste">
      <div className="space-y-6">
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <FileText size={16} className="text-yellow-500" />
              Generer un rapport par periode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Date debut</Label>
                <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="bg-white/5 border-white/20 text-white" style={{ colorScheme: 'dark' }} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Date fin</Label>
                <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="bg-white/5 border-white/20 text-white" style={{ colorScheme: 'dark' }} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Operateur</Label>
                <select
                  value={operateur}
                  onChange={(e) => setOperateur(e.target.value as 'TOUS' | 'MTN' | 'AIRTEL')}
                  disabled={destination !== 'arpce'}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-60"
                >
                  <option value="TOUS" className="bg-slate-900">TOUS</option>
                  <option value="MTN" className="bg-slate-900">MTN</option>
                  <option value="AIRTEL" className="bg-slate-900">AIRTEL</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Destination</Label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value as ReportDestination)}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500"
                >
                  {DESTINATION_OPTIONS.map(option => (
                    <option key={option.value} value={option.value} className="bg-slate-900">{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-xs text-slate-300">
              Signature du rapport: <span className="text-white font-bold">{user.nom}</span>
              {' · '}Statut initial: <span className="text-yellow-400 font-bold">BROUILLON</span>
            </div>

            <Button onClick={handleCreateDraft} disabled={creating} className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold">
              {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generation...</> : 'Generer le brouillon'}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'brouillons', label: 'Brouillons', count: counts.brouillons },
            { id: 'arpce', label: 'Envoyes a l\'ARPCE', count: counts.arpce },
            { id: 'operateurs', label: 'Envoyes aux operateurs', count: counts.operateurs },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as ReportTab)}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-bold border transition-all',
                tab === item.id
                  ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                  : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30'
              )}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {loading && (
            <Card className="bg-white/5 border-white/10 xl:col-span-2">
              <CardContent className="py-10 text-center text-slate-400">Chargement des rapports...</CardContent>
            </Card>
          )}

          {!loading && filteredReports.length === 0 && (
            <Card className="bg-white/5 border-white/10 xl:col-span-2">
              <CardContent className="py-10 text-center text-slate-400">Aucun rapport dans cet onglet.</CardContent>
            </Card>
          )}

          {!loading && filteredReports.map((report) => {
            const status = STATUS_CONFIG[report.statut_rapport];
            const StatusIcon = status.icon;
            const items = getReportItems(report);
            const reference = report.reference_unique || report.contenu_json.reference || 'N/A';
            const signatureDate = report.date_signature || report.contenu_json.signature?.date_signature;
            return (
              <Card key={report.id} className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-white font-bold">{report.contenu_json.titre}</p>
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-slate-300">
                          Ref: <span className="font-bold text-white">{reference}</span>
                        </span>
                        <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-slate-300">
                          Destination: <span className="font-bold text-white">{report.destinataire_role.toUpperCase()}</span>
                        </span>
                        <span className={cn('px-2 py-1 rounded border flex items-center gap-1', status.className)}>
                          <StatusIcon size={11} /> {status.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <p>{items.length} MSISDN</p>
                      <p>{report.operateur}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-slate-500 uppercase tracking-wider text-[10px] font-bold mb-1">Periode</p>
                      <p className="text-slate-200">
                        {report.periode_debut || report.contenu_json.periode?.date_debut || '-'}
                        {' -> '}
                        {report.periode_fin || report.contenu_json.periode?.date_fin || '-'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-slate-500 uppercase tracking-wider text-[10px] font-bold mb-1">Signature</p>
                      <p className="text-slate-200">{report.analyste_nom || report.contenu_json.signature?.analyste_nom || user.nom}</p>
                      <p className="text-slate-500 mt-1">
                        {signatureDate ? new Date(signatureDate).toLocaleString('fr-FR') : 'Non envoye'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Extrait des MSISDN</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.slice(0, 8).map((item) => (
                        <span key={item.id} className="font-mono text-[10px] bg-white/5 text-slate-300 px-2 py-1 rounded border border-white/10">
                          {item.numero_sim}
                        </span>
                      ))}
                      {items.length > 8 && <span className="text-[10px] text-slate-500">+{items.length - 8} autres</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => handleDownload(report)} variant="outline" className="border-white/20 text-white hover:bg-white/10">
                      <Download size={14} className="mr-2" /> Telecharger PDF
                    </Button>
                    {report.statut_rapport === 'brouillon' && (
                      <Button onClick={() => handleSend(report)} disabled={sendingId === report.id} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {sendingId === report.id
                          ? <><Loader2 size={14} className="mr-2 animate-spin" /> Envoi...</>
                          : <><Send size={14} className="mr-2" /> Envoyer</>}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
