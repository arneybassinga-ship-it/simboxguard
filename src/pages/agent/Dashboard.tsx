import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Upload, FileCheck, AlertTriangle, ShieldOff,
  TrendingUp, Activity, Wifi, Clock
} from 'lucide-react';
import { showError } from '../../utils/toast';

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

// Génère les données d'évolution du trafic par heure depuis les CDR
const buildTrafficData = (analyses: SimAnalysis[]) => {
  const heures = Array.from({ length: 24 }, (_, i) => ({
    heure: `${String(i).padStart(2, '0')}h`,
    volume: 0,
    suspects: 0,
    echecs: 0,
  }));
  analyses.forEach(a => {
    const h = new Date(a.date_analyse).getHours();
    heures[h].volume += a.criteres?.appels_par_heure ?? 0;
    if (a.niveau_alerte !== 'normale') heures[h].suspects += 1;
    heures[h].echecs += Math.round((a.criteres?.taux_echec ?? 0));
  });
  return heures;
};

// Données topologie réseau (simulées depuis les analyses)
const buildTopoData = (analyses: SimAnalysis[]) => {
  const par_msc: Record<string, number> = {};
  analyses.forEach((a, i) => {
    const msc = `MSC-${(i % 4) + 1}`;
    par_msc[msc] = (par_msc[msc] ?? 0) + (a.criteres?.appels_par_heure ?? 0);
  });
  return Object.entries(par_msc).map(([name, charge]) => ({ name, charge }));
};

// Données pics de trafic (volume CDR par jour simulé)
const buildPicsData = (fichiers: FichierCDR[]) => {
  const par_jour: Record<string, number> = {};
  fichiers.forEach(f => {
    const jour = new Date(f.date_import).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    par_jour[jour] = (par_jour[jour] ?? 0) + f.nb_lignes;
  });
  return Object.entries(par_jour).slice(-7).map(([jour, lignes]) => ({ jour, lignes }));
};

const AgentDashboard = () => {
  const [fichiers, setFichiers] = useState<FichierCDR[]>([]);
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const operateur = user.operateur ?? 'MTN';
  const heure = new Date().getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:4000/api/cdr/files').then(r => r.json()),
      fetch('http://localhost:4000/api/cdr/analyses').then(r => r.json()),
    ])
      .then(([f, a]) => {
        setFichiers(f.filter((x: FichierCDR) => x.operateur === operateur));
        setAnalyses(a.filter((x: SimAnalysis) => x.operateur === operateur));
      })
      .catch(() => showError('Erreur chargement tableau de bord'))
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total_cdr: fichiers.length,
    total_lignes: fichiers.reduce((s, f) => s + f.nb_lignes, 0),
    en_attente: analyses.filter(a => a.statut === 'en_attente').length,
    confirmees: analyses.filter(a => a.statut === 'confirmee').length,
    refusees: analyses.filter(a => a.statut === 'refusee').length,
    critiques: analyses.filter(a => a.niveau_alerte === 'critique').length,
  };

  const trafficData = buildTrafficData(analyses);
  const topoData = buildTopoData(analyses);
  const picsData = buildPicsData(fichiers);

  const CARDS = [
    {
      label: 'CDR importés',
      value: stats.total_cdr,
      sub: `${stats.total_lignes.toLocaleString()} lignes total`,
      icon: Upload,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'SIM en attente',
      value: stats.en_attente,
      sub: 'Décision analyste requise',
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'SIM confirmées',
      value: stats.confirmees,
      sub: 'SimBox validées',
      icon: FileCheck,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Alertes critiques',
      value: stats.critiques,
      sub: 'Score > 80%',
      icon: AlertTriangle,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <DashboardLayout title="">
      {/* Salutation */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          {salutation}, <span className={cn(
            operateur === 'MTN' ? 'text-yellow-600' : 'text-red-600'
          )}>{operateur}</span> 👋
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Voici l'état de votre réseau au {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          })}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {CARDS.map(c => (
          <div key={c.label} className={cn('rounded-2xl p-4', c.bg)}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-medium">{c.label}</p>
              <c.icon size={16} className={c.color} />
            </div>
            <p className={cn('text-3xl font-bold', c.color)}>{c.value}</p>
            <p className="text-[11px] text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Graphique 1 — Évolution du trafic par heure */}
      <Card className="mb-5">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">
              Évolution du trafic par heure
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading
            ? <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Chargement...</div>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trafficData}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSuspects" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="heure" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '0.5px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area
                    type="monotone" dataKey="volume" name="Volume appels"
                    stroke="#3B82F6" strokeWidth={2}
                    fill="url(#gradVolume)" />
                  <Area
                    type="monotone" dataKey="suspects" name="SIM suspectes"
                    stroke="#EF4444" strokeWidth={2}
                    fill="url(#gradSuspects)" />
                </AreaChart>
              </ResponsiveContainer>
            )
          }
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

        {/* Graphique 2 — Volume CDR par jour (pics de trafic) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-green-500" />
              <CardTitle className="text-sm font-semibold text-slate-700">
                Pics de trafic — 7 derniers jours
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading
              ? <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Chargement...</div>
              : picsData.length === 0
              ? <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
                  Aucune donnée — importez des CDR
                </div>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={picsData}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="jour" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '0.5px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="lignes" name="Lignes CDR" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        {/* Graphique 3 — Charge MSC (topologie réseau) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-purple-500" />
              <CardTitle className="text-sm font-semibold text-slate-700">
                Charge MSC — Topologie réseau
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading
              ? <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Chargement...</div>
              : topoData.length === 0
              ? <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
                  Aucune donnée — importez des CDR
                </div>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={topoData} layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={55} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '0.5px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="charge" name="Appels/h" fill="#a855f7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>
      </div>

      {/* CDR récents */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ShieldOff size={16} className="text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">
              CDR récents importés
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading
            ? <p className="text-slate-400 text-sm">Chargement...</p>
            : fichiers.length === 0
            ? (
              <div className="text-center py-10">
                <Upload size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucun CDR importé pour le moment.</p>
                <a href="/agent/import"
                  className="text-blue-500 text-xs mt-1 inline-block hover:underline">
                  Importer un fichier CDR →
                </a>
              </div>
            )
            : (
              <div className="space-y-2">
                {fichiers.slice(0, 5).map(f => (
                  <div key={f.id}
                    className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <FileCheck size={14} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 font-mono">
                          {f.nom_fichier}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(f.date_import).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-700">
                        {f.nb_lignes.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400">lignes</p>
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded ml-3',
                      f.statut === 'analysé'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    )}>
                      {f.statut?.toUpperCase() ?? 'IMPORTÉ'}
                    </span>
                  </div>
                ))}
                {fichiers.length > 5 && (
                  <a href="/agent/import"
                    className="block text-center text-xs text-blue-500 pt-2 hover:underline">
                    Voir tous les CDR ({fichiers.length}) →
                  </a>
                )}
              </div>
            )
          }
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AgentDashboard;
