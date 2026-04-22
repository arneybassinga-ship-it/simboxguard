import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShieldAlert, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { apiUrl } from '../../lib/api';

interface SimAnalysis {
  id: string; numero_sim: string; operateur: string; score_suspicion: number; statut: string;
}
interface Ordre {
  id: string; operateur: string; liste_sim_json: string[];
  delai_heures: number; date_emission: string; date_limite: string;
  statut: string; delai_restant_heures?: number;
}

const ArpceBlocking = () => {
  const [sims, setSims]       = useState<SimAnalysis[]>([]);
  const [ordres, setOrdres]   = useState<Ordre[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [delai, setDelai]     = useState(48);
  const [operateur, setOperateur] = useState('MTN');
  const [busy, setBusy]       = useState(false);
  const [modal, setModal]     = useState(false);

  const loadData = () => {
    Promise.all([
      fetch(apiUrl('/api/cdr/analyses')).then(r => r.json()),
      fetch(apiUrl('/api/ordres')).then(r => r.json()),
    ]).then(([a, o]) => {
      setSims(a.filter((x: SimAnalysis) => x.statut === 'confirmee'));
      setOrdres(o);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const emettre = async () => {
    if (selected.length === 0) return showError('Sélectionnez au moins une MSISDN');
    setBusy(true);
    try {
      await fetch(apiUrl('/api/ordres/bloquer'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operateur, liste_sim: selected, delai_heures: delai, rapport_id: 'manual' }),
      });
      showSuccess(`Ordre de blocage émis — ${selected.length} MSISDN`);
      setSelected([]); setModal(false); loadData();
    } catch { showError('Erreur émission ordre'); }
    setBusy(false);
  };

  const simsFiltered = sims.filter(s => s.operateur === operateur);

  return (
    <DashboardLayout title="Ordres de Blocage — ARPCE">

      {/* Filtre opérateur + bouton émettre */}
      <div className="flex justify-between items-center mb-5">
        <div className="flex gap-2">
          {['MTN', 'AIRTEL'].map(op => (
            <button key={op} onClick={() => { setOperateur(op); setSelected([]); }}
              className={cn('px-4 py-1.5 rounded-full text-xs font-bold border transition-all',
                operateur === op
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-white/20 text-slate-400 hover:text-white hover:border-white/40')}>
              {op}
            </button>
          ))}
        </div>
        <Button onClick={() => setModal(true)} className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <ShieldAlert size={14}/> Émettre un ordre de blocage
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-slate-400 mb-1">SIMs frauduleuses</p>
          <p className="text-3xl font-bold text-red-400">{sims.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-slate-400 mb-1">Ordres émis</p>
          <p className="text-3xl font-bold text-orange-400">{ordres.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-slate-400 mb-1">Blocages effectués</p>
          <p className="text-3xl font-bold text-green-400">{ordres.filter(o => o.statut === 'bloque').length}</p>
        </div>
      </div>

      {/* Liste des ordres */}
      <Card className="bg-white/5 border-white/10 mb-5">
        <CardHeader>
          <CardTitle className="text-white text-sm">Ordres de blocage émis</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm">Chargement...</p>
          ) : ordres.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Aucun ordre émis.</p>
          ) : (
            <div className="space-y-3">
              {ordres.map(o => (
                <div key={o.id} className={cn(
                  'rounded-xl p-4 border',
                  o.statut === 'bloque'  ? 'bg-green-500/10 border-green-500/30' :
                  o.statut === 'depasse' ? 'bg-red-500/10 border-red-500/30'     :
                                           'bg-orange-500/10 border-orange-500/30'
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {o.statut === 'bloque'  ? <CheckCircle   size={16} className="text-green-400"/> :
                       o.statut === 'depasse' ? <AlertTriangle size={16} className="text-red-400"/>   :
                                                <Clock          size={16} className="text-orange-400"/>}
                      <div>
                        <p className="text-xs font-bold text-white">
                          {o.operateur} — {Array.isArray(o.liste_sim_json) ? o.liste_sim_json.length : '?'} MSISDN
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Émis le {new Date(o.date_emission).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded',
                      o.statut === 'bloque'  ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                      o.statut === 'depasse' ? 'bg-red-500/20 text-red-400 border border-red-500/30'       :
                                               'bg-orange-500/20 text-orange-400 border border-orange-500/30')}>
                      {o.statut === 'bloque' ? 'BLOQUÉ' :
                       o.statut === 'depasse' ? 'DÉLAI DÉPASSÉ' :
                       `${o.delai_restant_heures}h restantes`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal émettre ordre */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-white mb-5">
              Émettre un ordre de blocage — {operateur}
            </h2>

            {/* Délai */}
            <div className="mb-5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Délai de blocage
              </label>
              <div className="flex gap-2">
                {[24, 48, 72].map(h => (
                  <button key={h} onClick={() => setDelai(h)}
                    className={cn('px-4 py-2 rounded-lg text-sm font-bold border transition-all',
                      delai === h
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-white/20 text-slate-400 hover:border-white/40 hover:text-white')}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Liste MSISDN */}
            <div className="mb-5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                MSISDN à bloquer ({simsFiltered.length} disponibles)
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-white/10 rounded-xl p-2 bg-white/5">
                {simsFiltered.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">
                    Aucune SIM frauduleuse pour {operateur}
                  </p>
                ) : simsFiltered.map(s => (
                  <label key={s.id}
                    className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                    <input type="checkbox"
                      checked={selected.includes(s.numero_sim)}
                      onChange={e => setSelected(p =>
                        e.target.checked ? [...p, s.numero_sim] : p.filter(x => x !== s.numero_sim)
                      )}
                      className="rounded accent-blue-500"/>
                    <span className="font-mono text-xs font-bold text-slate-200">{s.numero_sim}</span>
                    <span className="text-xs text-red-400 font-bold ml-auto">{s.score_suspicion}%</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={emettre} disabled={busy || selected.length === 0}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
                {busy ? 'Émission...' : `Émettre l'ordre (${selected.length} MSISDN)`}
              </Button>
              <Button variant="outline" onClick={() => setModal(false)}
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
export default ArpceBlocking;
