import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Cpu, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { showError } from '../../utils/toast';
import { User, SimAnalysis, SimboxDetection } from '../../types';
import { cn } from '@/lib/utils';
import { apiFetch } from '../../lib/api';

// ─── Statut badge SimBox ───────────────────────────────────────────────────────
const STATUT_SIMBOX = {
  en_attente: { label: 'En attente', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  validee:    { label: 'Validée',    cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  rejetee:    { label: 'Rejetée',    cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
};

const NIVEAU_SIMBOX = {
  confirme: { label: 'Confirmé', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  probable: { label: 'Probable', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  suspect:  { label: 'Suspect',  cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
};

// ─── Carte boîtier SimBox (read-only) ─────────────────────────────────────────
const SimboxGroupCard = ({ item }: { item: SimboxDetection }) => {
  const [open, setOpen] = useState(false);

  const niveauCfg = NIVEAU_SIMBOX[item.niveau];
  const statutCfg = STATUT_SIMBOX[item.statut];

  // Dédupliquer les IMEI et regrouper les SIM par IMEI
  const imeiMap: Record<string, string[]> = {};
  if (item.imei_par_sim) {
    for (const [sim, imeis] of Object.entries(item.imei_par_sim)) {
      for (const imei of imeis) {
        if (!imeiMap[imei]) imeiMap[imei] = [];
        imeiMap[imei].push(sim);
      }
    }
  }
  const imeiList = Object.entries(imeiMap); // [[imei, [sim1, sim2]], ...]
  const hasImei = imeiList.length > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border', niveauCfg.cls)}>
              {niveauCfg.label}
            </span>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', statutCfg.cls)}>
              {statutCfg.label}
            </span>
            <span className="text-[10px] text-slate-500">Score {item.score_global}/100</span>
          </div>
          <p className="text-sm font-bold text-white">
            {item.nb_sims} MSISDN — {item.operateur}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Période : {new Date(item.periode_debut).toLocaleDateString('fr-FR')} →{' '}
            {new Date(item.periode_fin).toLocaleDateString('fr-FR')}
            {' · '}Similarité {item.similarite_moyenne}% · Rotation {item.score_rotation}%
          </p>
        </div>
        <button onClick={() => setOpen(v => !v)} className="p-1 text-slate-400 hover:text-white flex-shrink-0 mt-0.5">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-4">

          {/* Boîtiers physiques (groupés par IMEI) */}
          {hasImei ? (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Cpu size={10} /> Boîtiers détectés ({imeiList.length} IMEI)
              </p>
              <div className="space-y-2">
                {imeiList.map(([imei, sims]) => (
                  <div key={imei} className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-2.5">
                    {/* IMEI */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <Cpu size={9} className="text-purple-400 flex-shrink-0" />
                      <span className="font-mono text-[11px] font-bold text-purple-300">{imei}</span>
                    </div>
                    {/* SIM dans ce boîtier */}
                    <div className="flex flex-wrap gap-1.5">
                      {sims.map(sim => (
                        <span key={sim} className="font-mono text-[10px] bg-white/5 text-slate-300 px-2 py-0.5 rounded border border-white/10">
                          {sim}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Pas d'IMEI : afficher juste les MSISDN */
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Users size={10} /> MSISDN du groupe
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.sims.map(sim => (
                  <span key={sim} className="font-mono text-[10px] bg-white/5 text-slate-300 px-2 py-0.5 rounded border border-white/10">
                    {sim}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contacts communs */}
          {item.contacts_communs.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                Contacts en commun ({item.contacts_communs.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.contacts_communs.slice(0, 8).map(c => (
                  <span key={c} className="font-mono text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                    {c}
                  </span>
                ))}
                {item.contacts_communs.length > 8 && (
                  <span className="text-[10px] text-slate-500">+{item.contacts_communs.length - 8} autres</span>
                )}
              </div>
            </div>
          )}

          {item.motif_rejet && (
            <p className="text-xs text-slate-400 italic">Motif rejet : {item.motif_rejet}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Page principale ───────────────────────────────────────────────────────────
const AgentAnalyses = () => {
  const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}') as User;
  const operateur = user.operateur;

  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [simboxes, setSimboxes] = useState<SimboxDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSimbox, setLoadingSimbox] = useState(true);

  // Chargement analyses individuelles
  useEffect(() => {
    apiFetch('/api/cdr/analyses')
      .then(r => r.json())
      .then((data: SimAnalysis[]) => {
        setAnalyses(data.filter(a => !operateur || a.operateur === operateur));
      })
      .catch(() => showError('Erreur chargement des analyses'))
      .finally(() => setLoading(false));
  }, [operateur]);

  // Chargement groupes SimBox
  useEffect(() => {
    apiFetch('/api/simbox')
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(data)) return;
        setSimboxes(data.filter((s: SimboxDetection) => !operateur || s.operateur === operateur));
      })
      .catch(() => showError('Erreur chargement des groupes SimBox'))
      .finally(() => setLoadingSimbox(false));
  }, [operateur]);

  const confirmees = analyses.filter(a => a.statut === 'confirmee');

  return (
    <DashboardLayout title="Mes Analyses Reçues">

      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-white">{analyses.length}</p>
          <p className="text-xs text-slate-400 mt-1">Total MSISDN analysées</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-red-400">{confirmees.length}</p>
          <p className="text-xs text-slate-400 mt-1">SIMs frauduleuses</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-green-400">
            {analyses.filter(a => a.statut === 'refusee').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Faux positifs</p>
        </div>
      </div>

      {/* Tableau analyses individuelles */}
      <Card className="bg-white/5 border-white/10 mb-6">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FileText size={16} className="text-blue-400" />
            Résultats d'analyse — {operateur}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm py-8 text-center">Chargement...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MSISDN</TableHead>
                  <TableHead>Date analyse</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.length > 0 ? analyses.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs font-bold">{a.numero_sim}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {new Date(a.date_analyse).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', a.score_suspicion >= 60 ? 'bg-red-500' : a.score_suspicion >= 40 ? 'bg-orange-400' : 'bg-green-400')}
                            style={{ width: `${a.score_suspicion}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-white">{a.score_suspicion}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                        a.niveau_alerte === 'critique' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        a.niveau_alerte === 'elevee' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                        'bg-green-500/20 text-green-400 border border-green-500/30')}>
                        {a.niveau_alerte}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                        a.statut === 'confirmee' ? 'bg-red-500/20 text-red-400' :
                        a.statut === 'refusee' ? 'bg-green-500/20 text-green-400' :
                        'bg-blue-500/20 text-blue-400')}>
                        {a.statut === 'en_attente' ? 'En attente' : a.statut === 'confirmee' ? 'Sim Frauduleuse ✓' : 'Faux positif'}
                      </span>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                      Aucune analyse disponible. Importez un fichier CDR puis lancez une agrégation.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section groupes SimBox */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Cpu size={16} className="text-purple-400" />
            Boîtiers SimBox détectés
            <span className="text-sm font-normal text-slate-400 ml-1">({simboxes.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSimbox ? (
            <p className="text-slate-400 text-sm py-8 text-center">Chargement...</p>
          ) : simboxes.length === 0 ? (
            <p className="text-center py-10 text-slate-500 text-sm">
              Aucun groupe SimBox détecté pour votre opérateur.
            </p>
          ) : (
            <div className="space-y-3">
              {simboxes.map(item => (
                <SimboxGroupCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </DashboardLayout>
  );
};

export default AgentAnalyses;