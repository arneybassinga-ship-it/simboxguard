import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, ShieldAlert } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { apiUrl } from '../../lib/api';

interface RapportSim {
  id: string;
  numero_sim: string;
}

interface Rapport {
  id: string;
  type: string;
  operateur: string;
  date_envoi: string;
  statut_lu: boolean;
  reference_unique?: string | null;
  statut_rapport?: string;
  analyste_nom?: string | null;
  date_signature?: string | null;
  contenu_json: {
    titre: string;
    total: number;
    reference?: string | null;
    signature?: {
      analyste_nom?: string | null;
      date_signature?: string | null;
    };
    analyses?: RapportSim[];
    sims_confirmees?: RapportSim[];
  };
}

const getRapportSims = (rapport: Rapport): RapportSim[] =>
  rapport.contenu_json.sims_confirmees
  ?? rapport.contenu_json.analyses
  ?? [];

const ArpceReports = () => {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreOp, setFiltreOp] = useState('tous');
  const [modalBlocage, setModalBlocage] = useState<Rapport | null>(null);
  const [delaiChoisi, setDelaiChoisi] = useState(48);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/rapports?role=arpce'))
      .then(r => r.json())
      .then(setRapports)
      .catch(() => showError('Erreur chargement rapports'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rapports.filter(r =>
    filtreOp === 'tous' || r.operateur === filtreOp
  );

  const handleEmettreOrdre = async () => {
    if (!modalBlocage) return;
    setSubmitting(true);
    try {
      const sims = getRapportSims(modalBlocage).map((s) => s.numero_sim);
      if (sims.length === 0) throw new Error('Aucune MSISDN à bloquer dans ce rapport');
      const resp = await fetch(apiUrl('/api/ordres/bloquer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rapport_id: modalBlocage.id,
          operateur: modalBlocage.operateur,
          liste_sim: sims,
          delai_heures: delaiChoisi,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      showSuccess(`Ordre émis — ${sims.length} MSISDN — délai ${delaiChoisi}h ✓`);
      setModalBlocage(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Erreur lors de l'émission de l'ordre");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Rapports reçus">

      {/* Filtres opérateur */}
      <div className="flex gap-2 mb-6">
        {['tous', 'MTN', 'AIRTEL'].map(op => (
          <button key={op} onClick={() => setFiltreOp(op)}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-bold border transition-all',
              filtreOp === op
                ? 'bg-white/10 text-white border-white/30'
                : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30'
            )}>
            {op.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">
          {filtered.length} rapport(s)
        </span>
      </div>

      {loading && <p className="text-slate-400 text-sm">Chargement...</p>}

      <div className="space-y-3">
        {filtered.length === 0 && !loading && (
          <p className="text-slate-400 text-sm text-center py-16">
            Aucun rapport reçu.
          </p>
        )}
        {filtered.map(r => (
          <Card key={r.id} className={cn(
            'border transition-all',
            !r.statut_lu ? 'border-blue-500/40 bg-blue-500/10' : 'bg-white/5 border-white/10'
          )}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center',
                    r.operateur === 'MTN' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                  )}>
                    <FileText size={20} className={
                      r.operateur === 'MTN' ? 'text-yellow-400' : 'text-red-400'
                    } />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">
                      {r.contenu_json?.titre ?? 'Rapport simbox'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded border',
                        r.operateur === 'MTN'
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      )}>
                        {r.operateur}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(r.date_envoi).toLocaleString('fr-FR')}
                      </span>
                      {!r.statut_lu && (
                        <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                          NOUVEAU
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-slate-500">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        Ref: <span className="font-bold text-slate-300">{r.reference_unique || r.contenu_json?.reference || 'N/A'}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        Statut: <span className="font-bold text-slate-300">{(r.statut_rapport || 'envoye').toUpperCase()}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-red-400">
                      {r.contenu_json?.total ?? 0}
                    </p>
                    <p className="text-[10px] text-slate-400">MSISDN à bloquer</p>
                  </div>
                  <Button size="sm"
                    onClick={() => { setModalBlocage(r); setDelaiChoisi(48); }}
                    className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 text-xs gap-1.5">
                    <ShieldAlert size={13} />
                    Émettre ordre
                  </Button>
                </div>
              </div>

              {getRapportSims(r).length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <p className="text-[10px] text-slate-500 mb-2">
                    Signé par {r.analyste_nom || r.contenu_json?.signature?.analyste_nom || 'Analyste fraude'}
                    {' · '}
                    {r.date_signature || r.contenu_json?.signature?.date_signature
                      ? new Date(r.date_signature || r.contenu_json.signature?.date_signature || '').toLocaleString('fr-FR')
                      : 'non envoyé'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    SIMs frauduleuses
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getRapportSims(r).map((s) => (
                      <span key={s.id}
                        className="font-mono text-[10px] bg-white/5 border border-white/10 text-slate-300 px-2 py-0.5 rounded">
                        {s.numero_sim}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal ordre de blocage */}
      {modalBlocage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <ShieldAlert size={22} className="text-orange-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Ordre de blocage</h2>
                <p className="text-xs text-slate-400">
                  {modalBlocage.operateur} — {modalBlocage.contenu_json?.total ?? 0} MSISDN
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-5 max-h-32 overflow-y-auto">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                MSISDN concernées
              </p>
              <div className="flex flex-wrap gap-1">
                {getRapportSims(modalBlocage).map((s) => (
                  <span key={s.id}
                    className="font-mono text-[10px] bg-white/5 border border-white/10 text-slate-300 px-2 py-0.5 rounded">
                    {s.numero_sim}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                Délai accordé à l'opérateur
              </label>
              <div className="flex gap-3">
                {[24, 48, 72].map(h => (
                  <button key={h} onClick={() => setDelaiChoisi(h)}
                    className={cn(
                      'flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all',
                      delaiChoisi === h
                        ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                        : 'border-white/15 text-slate-400 hover:border-white/30 hover:text-white'
                    )}>
                    {h}h
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Sans blocage dans ce délai → sanction automatique déclenchée.
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleEmettreOrdre} disabled={submitting}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold">
                {submitting ? 'Émission...' : `Émettre (${delaiChoisi}h)`}
              </Button>
              <Button variant="outline" onClick={() => setModalBlocage(null)}
                disabled={submitting} className="flex-1 border-white/20 text-white hover:bg-white/10">
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default ArpceReports;
