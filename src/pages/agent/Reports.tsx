import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FileText, Download, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showError } from '../../utils/toast';
import { apiFetch } from '../../lib/api';
import { generateRapportAnalyseCDR } from '../../lib/generatePDF';
import { User } from '../../types';

interface RapportSim {
  id: string;
  numero_sim: string;
  score_suspicion?: number;
  niveau_alerte?: string;
  statut?: string;
  criteres?: {
    appels_par_heure?: number;
    duree_moyenne?: number;
    taux_echec?: number;
    pct_nuit?: number;
    pct_international?: number;
    anciennete_jours?: number;
  };
}

interface Rapport {
  id: string;
  operateur: string;
  date_envoi: string;
  statut_lu: boolean;
  statut_rapport?: string;
  analyste_nom?: string | null;
  reference_unique?: string | null;
  contenu_json: {
    titre?: string;
    total?: number;
    analyses?: RapportSim[];
    sims_confirmees?: RapportSim[];
    periode?: { date_debut?: string | null; date_fin?: string | null };
  };
}

const getSims = (r: Rapport): RapportSim[] =>
  r.contenu_json.sims_confirmees ?? r.contenu_json.analyses ?? [];

const AgentReports = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const roleKey = user.role === 'AGENT_MTN' ? 'agent_mtn' : 'agent_airtel';

  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/rapports?role=${roleKey}`)
      .then(r => r.json())
      .then(data => setRapports(Array.isArray(data) ? data : []))
      .catch(() => showError('Erreur chargement rapports'))
      .finally(() => setLoading(false));
  }, [roleKey]);

  const handleDownload = (r: Rapport) => {
    try {
      const sims = getSims(r);
      if (sims.length === 0) { showError('Aucune donnée à exporter'); return; }
      generateRapportAnalyseCDR(sims as any, r.operateur);
    } catch {
      showError('Erreur lors de la génération du PDF');
    }
  };

  return (
    <DashboardLayout title="Rapports reçus">
      <div className="mb-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FileText size={16} className="text-blue-400" />
          Rapports envoyés par l'Analyste fraude
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Ces rapports contiennent les MSISDN suspectes identifiées sur votre réseau.
        </p>
      </div>

      {loading && <p className="text-slate-400 text-sm">Chargement...</p>}

      {!loading && rapports.length === 0 && (
        <div className="text-center py-20">
          <FileText size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Aucun rapport reçu pour le moment.</p>
        </div>
      )}

      <div className="space-y-3">
        {rapports.map(r => {
          const sims = getSims(r);
          return (
            <Card key={r.id} className={cn(
              'border transition-all',
              !r.statut_lu
                ? 'border-blue-500/40 bg-blue-500/10'
                : 'bg-white/5 border-white/10'
            )}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                      <ShieldAlert size={20} className="text-yellow-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">
                        {r.contenu_json?.titre ?? 'Rapport d\'analyse CDR'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400">
                          {new Date(r.date_envoi).toLocaleString('fr-FR')}
                        </span>
                        {r.analyste_nom && (
                          <span className="text-[10px] text-slate-500">
                            · par {r.analyste_nom}
                          </span>
                        )}
                        {!r.statut_lu && (
                          <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                            NOUVEAU
                          </span>
                        )}
                      </div>
                      {r.reference_unique && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          Réf : <span className="font-bold text-slate-300">{r.reference_unique}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-400">{sims.length}</p>
                      <p className="text-[10px] text-slate-400">MSISDN</p>
                    </div>
                    <Button size="sm" variant="outline"
                      onClick={() => handleDownload(r)}
                      className="border-white/20 text-slate-300 hover:bg-white/10 text-xs gap-1.5">
                      <Download size={13} />
                      PDF
                    </Button>
                  </div>
                </div>

                {sims.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      MSISDN suspectes
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sims.map((s, i) => (
                        <span key={s.id ?? i}
                          className="font-mono text-[10px] bg-white/5 border border-white/10 text-slate-300 px-2 py-0.5 rounded">
                          {s.numero_sim}
                          {s.score_suspicion !== undefined && (
                            <span className="ml-1 text-slate-500">{s.score_suspicion}%</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
};

export default AgentReports;
