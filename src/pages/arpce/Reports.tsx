import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, ShieldAlert } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';

interface Rapport {
  id: string;
  type: string;
  operateur: string;
  date_envoi: string;
  statut_lu: boolean;
  contenu_json: {
    titre: string;
    total: number;
    sims_confirmees?: any[];
  };
}

const ArpceReports = () => {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreOp, setFiltreOp] = useState('tous');
  const [modalBlocage, setModalBlocage] = useState<Rapport | null>(null);
  const [delaiChoisi, setDelaiChoisi] = useState(48);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('http://localhost:4000/api/rapports?role=arpce')
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
      const sims = modalBlocage.contenu_json.sims_confirmees?.map((s: any) => s.numero_sim) ?? [];
      if (sims.length === 0) throw new Error('Aucune SIM à bloquer dans ce rapport');
      const resp = await fetch('http://localhost:4000/api/ordres/bloquer', {
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
      showSuccess(`Ordre émis — ${sims.length} SIM(s) — délai ${delaiChoisi}h ✓`);
      setModalBlocage(null);
    } catch (err: any) {
      showError(err.message);
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
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-300 text-slate-500 hover:border-slate-500'
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
            !r.statut_lu ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'
          )}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center',
                    r.operateur === 'MTN' ? 'bg-yellow-100' : 'bg-red-100'
                  )}>
                    <FileText size={20} className={
                      r.operateur === 'MTN' ? 'text-yellow-700' : 'text-red-600'
                    } />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-800">
                      {r.contenu_json?.titre ?? 'Rapport simbox'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded',
                        r.operateur === 'MTN'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-700'
                      )}>
                        {r.operateur}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(r.date_envoi).toLocaleString('fr-FR')}
                      </span>
                      {!r.statut_lu && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          NOUVEAU
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-red-600">
                      {r.contenu_json?.total ?? 0}
                    </p>
                    <p className="text-[10px] text-slate-400">SIM à bloquer</p>
                  </div>
                  <Button size="sm"
                    onClick={() => { setModalBlocage(r); setDelaiChoisi(48); }}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs gap-1.5">
                    <ShieldAlert size={13} />
                    Émettre ordre
                  </Button>
                </div>
              </div>

              {r.contenu_json?.sims_confirmees && r.contenu_json.sims_confirmees.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    SIM confirmées
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {r.contenu_json.sims_confirmees.map((s: any) => (
                      <span key={s.id}
                        className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center">
                <ShieldAlert size={22} className="text-orange-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Ordre de blocage</h2>
                <p className="text-xs text-slate-400">
                  {modalBlocage.operateur} — {modalBlocage.contenu_json?.total ?? 0} SIM(s)
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 mb-5 max-h-32 overflow-y-auto">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                SIM concernées
              </p>
              <div className="flex flex-wrap gap-1">
                {(modalBlocage.contenu_json?.sims_confirmees ?? []).map((s: any) => (
                  <span key={s.id}
                    className="font-mono text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                    {s.numero_sim}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3">
                Délai accordé à l'opérateur
              </label>
              <div className="flex gap-3">
                {[24, 48, 72].map(h => (
                  <button key={h} onClick={() => setDelaiChoisi(h)}
                    className={cn(
                      'flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all',
                      delaiChoisi === h
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    )}>
                    {h}h
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Sans blocage dans ce délai → sanction automatique déclenchée.
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleEmettreOrdre} disabled={submitting}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold">
                {submitting ? 'Émission...' : `Émettre (${delaiChoisi}h)`}
              </Button>
              <Button variant="outline" onClick={() => setModalBlocage(null)}
                disabled={submitting} className="flex-1">
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
