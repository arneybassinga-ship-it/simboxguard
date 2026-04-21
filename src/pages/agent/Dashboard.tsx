import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Upload, FileCheck, AlertTriangle, Clock,
  TrendingUp, Activity, Wifi, ScanSearch,
  ShieldAlert, Users,
} from 'lucide-react';
import { showError } from '../../utils/toast';
import { SimboxDetection } from '../../types';
import { apiUrl } from '../../lib/api';

interface FichierCDR {
  id: string;
  nom_fichier: string;
  operateur: string;
  date_import: string;
  nb_lignes: number;
  statut: string;
}

interface SimAnalysis {
  id: string;
  numero_sim: string;
  operateur: string;
  score_suspicion: number;
  niveau_alerte: string;
  statut: string;
  date_analyse: string;
  criteres: {
    appels_par_heure?: number;
    duree_moyenne?: number;
    taux_echec?: number;
    pct_nuit?: number;
    correspondants_uniques?: number;
    pct_international?: number;
  };
}

const buildTrafficData = (analyses: SimAnalysis[]) => {
  const heures = Array.from({ length: 24 }, (_, i) => ({
    heure: `${String(i).padStart(2, '0')}h`,
    volume: 0,
    suspects: 0,
  }));
  analyses.forEach(a => {
    const h = new Date(a.date_analyse).getHours();
    heures[h].volume += a.criteres?.appels_par_heure ?? 0;
    if (a.niveau_alerte !== 'normale') heures[h].suspects += 1;
  });
  return heures;
};

const buildPicsData = (fichiers: FichierCDR[]) => {
  const par_jour: Record<string, number> = {};
  fichiers.forEach(f => {
    const jour = new Date(f.date_import).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    par_jour[jour] = (par_jour[jour] ?? 0) + f.nb_lignes;
  });
  return Object.entries(par_jour).slice(-7).map(([jour, lignes]) => ({ jour, lignes }));
};

const NIVEAU_COLORS: Record<string, string> = {
  confirme: 'text-red-400',
  probable: 'text-orange-400',
  suspect:  'text-yellow-400',
};

const AgentDashboard = () => {
  const [fichiers, setFichiers]   = useState<FichierCDR[]>([]);
  const [analyses, setAnalyses]   = useState<SimAnalysis[]>([]);
  const [simboxes, setSimboxes]   = useState<SimboxDetection[]>([]);
  const [loading, setLoading]     = useState(true);

  const user       = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const operateur  = user.operateur ?? 'MTN';
  const heure      = new Date().getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';
  const isMTN      = operateur === 'MTN';

  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/api/cdr/files')).then(r => r.json()),
      fetch(apiUrl('/api/cdr/analyses')).then(r => r.json()),
      fetch(apiUrl('/api/simbox')).then(r => r.json()),
    ])
      .then(([f, a, s]) => {
        setFichiers(f.filter((x: FichierCDR) => x.operateur === operateur));
        setAnalyses(a.filter((x: SimAnalysis) => x.operateur === operateur));
        setSimboxes(s.filter((x: SimboxDetection) => x.operateur === operateur));
      })
      .catch(() => showError('Erreur chargement tableau de bord'))
      .finally(() => setLoading(false));
  }, [operateur]);

  const stats = {
    total_cdr:        fichiers.length,
    total_lignes:     fichiers.reduce((s, f) => s + f.nb_lignes, 0),
    msisdn_suspects:  analyses.filter(a => a.statut === 'en_attente').length,
    msisdn_confirmes: analyses.filter(a => a.statut === 'confirmee').length,
    critiques:        analyses.filter(a => a.niveau_alerte === 'critique').length,
    simbox_total:     simboxes.length,
    simbox_attente:   simboxes.filter(s => s.statut === 'en_attente').length,
    simbox_valides:   simboxes.filter(s => s.statut === 'validee').length,
  };

  const trafficData = buildTrafficData(analyses);
  const picsData    = buildPicsData(fichiers);

  const accentClass = isMTN ? 'text-yellow-400' : 'text-white';

  const CARDS = [
    {
      label: 'CDR importés',
      value: stats.total_cdr,
      sub: `${stats.total_lignes.toLocaleString()} lignes total`,
      icon: Upload,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'MSISDN suspects',
      value: stats.msisdn_suspects,
      sub: 'En attente de validation',
      icon: Clock,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
    },
    {
      label: 'MSISDN confirmés',
      value: stats.msisdn_confirmes,
      sub: 'Fraude validée analyste',
      icon: FileCheck,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
    {
      label: 'Alertes critiques',
      value: stats.critiques,
      sub: 'Score > 80%',
      icon: AlertTriangle,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
  ];

  return (
    <DashboardLayout title="">
      {/* Salutation */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">
          {salutation},&nbsp;
          <span className={accentClass}>{operateur}</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {CARDS.map(c => (
          <div key={c.label} className={cn('rounded-2xl p-4 border', c.bg, c.border)}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{c.label}</p>
              <c.icon size={15} className={c.color} />
            </div>
            <p className={cn('text-3xl font-black', c.color)}>{c.value}</p>
            <p className="text-[10px] text-slate-500 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Simbox section ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
          <ScanSearch size={16} className="text-red-400 mx-auto mb-1" />
          <p className="text-2xl font-black text-red-400">{stats.simbox_total}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Simbox détectées</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 text-center">
          <Clock size={16} className="text-yellow-400 mx-auto mb-1" />
          <p className="text-2xl font-black text-yellow-400">{stats.simbox_attente}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">En attente</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
          <ShieldAlert size={16} className="text-green-400 mx-auto mb-1" />
          <p className="text-2xl font-black text-green-400">{stats.simbox_valides}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Validées ARPCE</p>
        </div>
      </div>

      {/* Recent simbox detections */}
      {!loading && simboxes.length > 0 && (
        <Card className="bg-white/5 border-white/10 mb-5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ScanSearch size={15} className="text-red-400" />
              <CardTitle className="text-sm font-bold text-white">
                Dernières détections simbox
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {simboxes.slice(0, 5).map(s => (
                <div key={s.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <Users size={13} className="text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">
                        {s.nb_sims} MSISDN
                        <span className={cn('ml-2 text-[10px]', NIVEAU_COLORS[s.niveau] ?? 'text-slate-400')}>
                          [{s.niveau}]
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(s.periode_debut).toLocaleDateString('fr-FR')}
                        {' → '}
                        {new Date(s.periode_fin).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-white">{s.score_global}<span className="text-[10px] text-slate-500">/100</span></p>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded',
                      s.statut === 'validee'   ? 'bg-red-500/20 text-red-400' :
                      s.statut === 'rejetee'   ? 'bg-green-500/10 text-green-400' :
                                                 'bg-yellow-500/10 text-yellow-400'
                    )}>
                      {s.statut === 'validee' ? 'Validée' : s.statut === 'rejetee' ? 'Rejetée' : 'En attente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Graphique — Évolution du trafic par heure */}
      <Card className="bg-white/5 border-white/10 mb-5">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-blue-400" />
            <CardTitle className="text-sm font-bold text-white">
              Évolution du trafic par heure
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading
            ? <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Chargement...</div>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trafficData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="heure" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
                  <Area type="monotone" dataKey="volume"   name="Volume appels"    stroke="#3B82F6" strokeWidth={2} fill="url(#gV)" />
                  <Area type="monotone" dataKey="suspects" name="MSISDN suspects"  stroke="#EF4444" strokeWidth={2} fill="url(#gS)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

        {/* Volume CDR par jour */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-green-400" />
              <CardTitle className="text-sm font-bold text-white">
                Volume CDR — 7 derniers jours
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading
              ? <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Chargement...</div>
              : picsData.length === 0
              ? <div className="h-40 flex items-center justify-center text-slate-600 text-sm">
                  Importez des CDR pour voir le graphique
                </div>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={picsData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="jour" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Bar dataKey="lignes" name="Lignes CDR" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* Répartition des MSISDN par niveau */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Wifi size={15} className="text-purple-400" />
              <CardTitle className="text-sm font-bold text-white">
                Répartition MSISDN par niveau d'alerte
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading
              ? <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Chargement...</div>
              : analyses.length === 0
              ? <div className="h-40 flex items-center justify-center text-slate-600 text-sm">
                  Aucune analyse disponible
                </div>
              : (
                <div className="space-y-3 py-2">
                  {[
                    { label: 'Critique',  key: 'critique',  color: 'bg-red-500',    text: 'text-red-400' },
                    { label: 'Élevée',    key: 'elevee',    color: 'bg-orange-500', text: 'text-orange-400' },
                    { label: 'Normale',   key: 'normale',   color: 'bg-green-500',  text: 'text-green-400' },
                  ].map(({ label, key, color, text }) => {
                    const count = analyses.filter(a => a.niveau_alerte === key).length;
                    const pct   = analyses.length ? Math.round((count / analyses.length) * 100) : 0;
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={cn('font-bold', text)}>{label}</span>
                          <span className="text-slate-400">{count} MSISDN ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      {/* CDR récents */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileCheck size={15} className="text-slate-400" />
            <CardTitle className="text-sm font-bold text-white">
              CDR récemment importés
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading
            ? <p className="text-slate-500 text-sm">Chargement...</p>
            : fichiers.length === 0
            ? (
              <div className="text-center py-10">
                <Upload size={28} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Aucun CDR importé.</p>
                <a href="/agent/import" className="text-blue-400 text-xs mt-1 inline-block hover:underline">
                  Importer un fichier CDR →
                </a>
              </div>
            )
            : (
              <div className="space-y-2">
                {fichiers.slice(0, 5).map(f => (
                  <div key={f.id}
                    className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <FileCheck size={13} className="text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white font-mono">{f.nom_fichier}</p>
                        <p className="text-[10px] text-slate-500">
                          {new Date(f.date_import).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-black text-white">{f.nb_lignes.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500">lignes</p>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded',
                        f.statut === 'analysé' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'
                      )}>
                        {f.statut?.toUpperCase() ?? 'IMPORTÉ'}
                      </span>
                    </div>
                  </div>
                ))}
                {fichiers.length > 5 && (
                  <a href="/agent/import"
                    className="block text-center text-xs text-blue-400 pt-2 hover:underline">
                    Voir tous les CDR ({fichiers.length}) →
                  </a>
                )}
              </div>
            )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AgentDashboard;
