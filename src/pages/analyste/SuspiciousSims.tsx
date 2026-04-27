import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CheckCircle, XCircle, Filter, History, X,
  PhoneCall, Clock, Globe, TrendingUp, Phone, AlertTriangle,
} from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import type { SimAnalysis } from '../../types';
import { apiUrl } from '../../lib/api';

const MOTIFS = [
  'Télévendeur professionnel',
  'Call center légal',
  'Volume exceptionnel ponctuel',
  'Erreur de données CDR',
  'MSISDN entreprise enregistrée',
  'Autre (préciser)',
];

interface CdrLigne {
  id: string;
  numero_sim: string;
  numero_appele: string;
  date_heure: string;
  duree_secondes: number;
  statut_appel: 'abouti' | 'echoue';
  origine: 'national' | 'international';
  operateur: string;
  nom_fichier?: string;
}

interface SimStats {
  total: number;
  totalDuree: number;
  dureeMoy: number;
  dureeMax: number;
  aboutis: number;
  echoues: number;
  tauxAboutissement: number;
  internationaux: number;
  nationaux: number;
  tauxInternational: number;
  numerosAppeles: number;
  appelsParHeure: number;
}

interface Historique {
  stats: SimStats;
  lignes: CdrLigne[];
}

const fmtDuree = (s: number) => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

const StatCard = ({
  icon: Icon, label, value, sub, color = 'text-white',
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium uppercase tracking-wider">
      <Icon size={12} /> {label}
    </div>
    <div className={cn('text-xl font-bold', color)}>{value}</div>
    {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
  </div>
);

const PAGE_SIZE = 20;

const SuspiciousSims = () => {
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreOp, setFiltreOp] = useState('tous');
  const [filtreNiveau, setFiltreNiveau] = useState('tous');
  const [modalRefus, setModalRefus] = useState<SimAnalysis | null>(null);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  // Historique
  const [drawerSim, setDrawerSim] = useState<SimAnalysis | null>(null);
  const [historique, setHistorique] = useState<Historique | null>(null);
  const [loadingHisto, setLoadingHisto] = useState(false);
  const [page, setPage] = useState(1);

  const fetch_ = () => {
    setLoading(true);
    fetch(apiUrl('/api/cdr/analyses'))
      .then(r => r.json())
      .then(setAnalyses)
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetch_(); }, []);

  const filtered = analyses.filter(a => {
    if (a.statut !== 'en_attente') return false;
    if (filtreOp !== 'tous' && a.operateur !== filtreOp) return false;
    if (filtreNiveau !== 'tous' && a.niveau_alerte !== filtreNiveau) return false;
    return true;
  });

  const openHistorique = async (item: SimAnalysis) => {
    setDrawerSim(item);
    setHistorique(null);
    setPage(1);
    setLoadingHisto(true);
    try {
      const r = await fetch(apiUrl(`/api/cdr/sim/${encodeURIComponent(item.numero_sim)}/historique`));
      const data = await r.json();
      setHistorique(data);
    } catch {
      showError('Impossible de charger l\'historique');
    }
    setLoadingHisto(false);
  };

  const confirmer = async (item: SimAnalysis) => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/cdr/analyses/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'confirmee',
          justificatif_confirmation: `Confirmé par l'analyste le ${new Date().toLocaleDateString('fr-FR')}`,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setAnalyses(p => p.map(a => a.id === item.id ? { ...a, statut: 'confirmee' } : a));
      showSuccess(`MSISDN ${item.numero_sim} confirmée comme SIM frauduleuse ✓`);
      if (drawerSim?.id === item.id) setDrawerSim(null);
    } catch (e) { showError(e instanceof Error ? e.message : 'Erreur confirmation'); }
    setBusy(false);
  };

  const refuser = async () => {
    if (!modalRefus) return;
    setBusy(true);
    try {
      await fetch(apiUrl(`/api/cdr/analyses/${modalRefus.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'refusee', motif_refus: motif, details_refus: details }),
      });
      setAnalyses(p => p.map(a => a.id === modalRefus.id ? { ...a, statut: 'refusee' } : a));
      showSuccess('MSISDN classée faux positif');
      setModalRefus(null); setDetails(''); setMotif(MOTIFS[0]);
      if (drawerSim?.id === modalRefus.id) setDrawerSim(null);
    } catch { showError('Erreur refus'); }
    setBusy(false);
  };

  const lignesPage = historique
    ? historique.lignes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : [];
  const totalPages = historique ? Math.ceil(historique.lignes.length / PAGE_SIZE) : 1;

  return (
    <DashboardLayout title="MSISDN suspectes">
      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Filter size={14} className="text-slate-400" />
        {['tous', 'MTN', 'AIRTEL'].map(op => (
          <button key={op} onClick={() => setFiltreOp(op)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtreOp === op
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30')}>
            {op.toUpperCase()}
          </button>
        ))}
        <span className="ml-3 text-slate-300">|</span>
        {['tous', 'critique', 'elevee', 'normale'].map(n => (
          <button key={n} onClick={() => setFiltreNiveau(n)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtreNiveau === n
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30')}>
            {n.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tableau principal */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg text-white">
            MSISDN en attente{' '}
            <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400">Chargement...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-400">MSISDN</TableHead>
                  <TableHead className="text-slate-400">Opérateur</TableHead>
                  <TableHead className="text-slate-400">Score</TableHead>
                  <TableHead className="text-slate-400">Niveau</TableHead>
                  <TableHead className="text-slate-400">Durée moy.</TableHead>
                  <TableHead className="text-slate-400">App/h</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? filtered.map(item => (
                  <TableRow key={item.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-mono font-bold text-xs text-white">
                      {item.numero_sim}
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                        item.operateur === 'MTN'
                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                        {item.operateur}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full',
                            item.score_suspicion >= 60 ? 'bg-red-500'
                              : item.score_suspicion >= 40 ? 'bg-orange-400' : 'bg-green-400')}
                            style={{ width: `${item.score_suspicion}%` }} />
                        </div>
                        <span className="text-xs font-bold text-white">{item.score_suspicion}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                        item.niveau_alerte === 'critique'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : item.niveau_alerte === 'elevee'
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                            : 'bg-green-500/10 text-green-400 border border-green-500/20')}>
                        {item.niveau_alerte.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">
                      {item.criteres?.duree_moyenne ? `${Math.round(item.criteres.duree_moyenne)}s` : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">
                      {item.criteres?.appels_par_heure ?? '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openHistorique(item)}
                          className="text-xs h-7 px-2 gap-1 border-blue-500/30 bg-blue-500/10 hover:border-blue-400 hover:bg-blue-500/20 hover:text-blue-300 text-blue-400">
                          <History size={11} /> Historique
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => confirmer(item)}
                          className="bg-red-500 hover:bg-red-400 text-white text-xs h-7 px-2 gap-1">
                          <CheckCircle size={11} /> Confirmer
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setModalRefus(item)}
                          className="text-xs h-7 px-2 gap-1 border-orange-500/30 bg-orange-500/10 hover:border-orange-400 hover:bg-orange-500/20 hover:text-orange-300 text-orange-400">
                          <XCircle size={11} /> Refuser
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                      Aucune MSISDN en attente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Drawer historique ── */}
      {drawerSim && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div className="flex-1 bg-black/60" onClick={() => setDrawerSim(null)} />

          {/* Panneau */}
          <div className="w-full max-w-3xl bg-[#0b1120] border-l border-white/10 flex flex-col overflow-hidden">
            {/* En-tête */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <History size={16} className="text-blue-400" />
                  <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">Historique CDR</span>
                </div>
                <div className="font-mono text-lg font-bold text-white">{drawerSim.numero_sim}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                    drawerSim.operateur === 'MTN'
                      ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                    {drawerSim.operateur}
                  </span>
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                    drawerSim.niveau_alerte === 'critique'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : drawerSim.niveau_alerte === 'elevee'
                        ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        : 'bg-green-500/10 text-green-400 border border-green-500/20')}>
                    {drawerSim.niveau_alerte.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">Score : <span className="text-white font-bold">{drawerSim.score_suspicion}%</span></span>
                </div>
              </div>
              <button onClick={() => setDrawerSim(null)}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {loadingHisto ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500/50 border-t-blue-400 rounded-full animate-spin" />
                  <span className="text-sm">Chargement de l'historique...</span>
                </div>
              ) : historique ? (
                <>
                  {/* Stats */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Statistiques globales
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <StatCard icon={PhoneCall} label="Total appels" value={historique.stats.total} />
                      <StatCard icon={Clock} label="Durée totale" value={fmtDuree(historique.stats.totalDuree)} />
                      <StatCard icon={TrendingUp} label="Durée moyenne" value={fmtDuree(historique.stats.dureeMoy)} />
                      <StatCard icon={TrendingUp} label="Durée max" value={fmtDuree(historique.stats.dureeMax)} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                      <StatCard
                        icon={CheckCircle}
                        label="Aboutis"
                        value={`${historique.stats.aboutis} (${historique.stats.tauxAboutissement}%)`}
                        color="text-green-400"
                      />
                      <StatCard
                        icon={XCircle}
                        label="Échoués"
                        value={historique.stats.echoues}
                        color="text-red-400"
                      />
                      <StatCard
                        icon={Globe}
                        label="International"
                        value={`${historique.stats.internationaux} (${historique.stats.tauxInternational}%)`}
                        color={historique.stats.tauxInternational > 30 ? 'text-orange-400' : 'text-slate-200'}
                      />
                      <StatCard
                        icon={Phone}
                        label="Numéros uniques"
                        value={historique.stats.numerosAppeles}
                        sub="numéros appelés"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                      <StatCard
                        icon={AlertTriangle}
                        label="Appels/heure"
                        value={historique.stats.appelsParHeure}
                        color={historique.stats.appelsParHeure > 10 ? 'text-red-400' : 'text-slate-200'}
                      />
                      <StatCard
                        icon={PhoneCall}
                        label="Nationaux"
                        value={historique.stats.nationaux}
                      />
                    </div>
                  </div>

                  {/* Tableau des lignes CDR */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Détail des appels
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        {historique.lignes.length} enregistrement{historique.lignes.length > 1 ? 's' : ''}
                        {totalPages > 1 && ` — page ${page}/${totalPages}`}
                      </span>
                    </div>

                    {historique.lignes.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-8">Aucun enregistrement CDR trouvé.</p>
                    ) : (
                      <>
                        <div className="rounded-xl overflow-hidden border border-white/10">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-white/10 hover:bg-transparent bg-white/5">
                                <TableHead className="text-slate-400 text-[11px]">Date / Heure</TableHead>
                                <TableHead className="text-slate-400 text-[11px]">Numéro appelé</TableHead>
                                <TableHead className="text-slate-400 text-[11px]">Durée</TableHead>
                                <TableHead className="text-slate-400 text-[11px]">Statut</TableHead>
                                <TableHead className="text-slate-400 text-[11px]">Origine</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lignesPage.map(l => (
                                <TableRow key={l.id} className="border-white/5 hover:bg-white/5">
                                  <TableCell className="text-[11px] text-slate-300 whitespace-nowrap">
                                    {fmtDate(l.date_heure)}
                                  </TableCell>
                                  <TableCell className="font-mono text-[11px] text-white">
                                    {l.numero_appele}
                                  </TableCell>
                                  <TableCell className="text-[11px] text-slate-200">
                                    {fmtDuree(l.duree_secondes)}
                                  </TableCell>
                                  <TableCell>
                                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                                      l.statut_appel === 'abouti'
                                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                        : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                                      {l.statut_appel}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                                      l.origine === 'international'
                                        ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                        : 'bg-slate-500/10 text-slate-400 border border-slate-500/20')}>
                                      {l.origine}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-3">
                            <button
                              disabled={page === 1}
                              onClick={() => setPage(p => p - 1)}
                              className="px-3 py-1 rounded text-xs border border-white/15 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                              ← Précédent
                            </button>
                            <span className="text-xs text-slate-500">{page} / {totalPages}</span>
                            <button
                              disabled={page === totalPages}
                              onClick={() => setPage(p => p + 1)}
                              className="px-3 py-1 rounded text-xs border border-white/15 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                              Suivant →
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-sm text-center py-10">Erreur lors du chargement.</p>
              )}
            </div>

            {/* Actions en bas du drawer */}
            <div className="px-6 py-4 border-t border-white/10 shrink-0 flex gap-3">
              <Button disabled={busy} onClick={() => confirmer(drawerSim)}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white gap-2">
                <CheckCircle size={14} /> Confirmer fraude
              </Button>
              <Button variant="outline" disabled={busy}
                onClick={() => { setModalRefus(drawerSim); }}
                className="flex-1 border-orange-500/30 bg-orange-500/10 hover:border-orange-400 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 gap-2">
                <XCircle size={14} /> Refuser (faux positif)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal refus */}
      {modalRefus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-white mb-1">Refuser l'alerte</h2>
            <p className="text-sm text-slate-400 mb-4">
              MSISDN : <span className="font-mono font-bold text-white">{modalRefus.numero_sim}</span>
            </p>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Motif</label>
              <select value={motif} onChange={e => setMotif(e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500">
                {MOTIFS.map(m => <option key={m} className="bg-slate-900">{m}</option>)}
              </select>
            </div>
            <div className="mb-6">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Détails</label>
              <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3}
                placeholder="Expliquez pourquoi c'est un faux positif..."
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <Button onClick={refuser} disabled={busy}
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-white">
                {busy ? 'Enregistrement...' : 'Confirmer le refus'}
              </Button>
              <Button variant="outline" onClick={() => setModalRefus(null)}
                className="flex-1 border-white/20 text-white hover:bg-white/10">
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default SuspiciousSims;
