import React, { useEffect, useState } from 'react';
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
  const [sims, setSims] = useState<SimAnalysis[]>([]);
  const [ordres, setOrdres] = useState<Ordre[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [delai, setDelai] = useState(48);
  const [operateur, setOperateur] = useState('MTN');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);

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
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ operateur, liste_sim: selected, delai_heures: delai, rapport_id: 'manual' })
      });
      showSuccess(`Ordre de blocage émis — ${selected.length} MSISDN`);
      setSelected([]); setModal(false); loadData();
    } catch { showError('Erreur émission ordre'); }
    setBusy(false);
  };

  const simsFiltered = sims.filter(s => s.operateur === operateur);

  return (
    <DashboardLayout title="Ordres de Blocage — ARPCE">
      <div className="flex justify-between items-center mb-5">
        <div className="flex gap-2">
          {['MTN','AIRTEL'].map(op => (
            <button key={op} onClick={() => { setOperateur(op); setSelected([]); }}
              className={cn('px-4 py-1.5 rounded-full text-xs font-bold border transition-all',
                operateur===op ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500')}>
              {op}
            </button>
          ))}
        </div>
        <Button onClick={() => setModal(true)} className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <ShieldAlert size={14}/> Émettre un ordre de blocage
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-red-50 rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">MSISDN confirmées</p>
          <p className="text-3xl font-bold text-red-600">{sims.length}</p>
        </div>
        <div className="bg-orange-50 rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">Ordres émis</p>
          <p className="text-3xl font-bold text-orange-600">{ordres.length}</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">Blocages effectués</p>
          <p className="text-3xl font-bold text-green-600">{ordres.filter(o => o.statut==='bloque').length}</p>
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader><CardTitle className="text-sm">Ordres de blocage émis</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400 text-sm">Chargement...</p> :
          ordres.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Aucun ordre émis.</p> : (
            <div className="space-y-3">
              {ordres.map(o => (
                <div key={o.id} className={cn('rounded-xl p-4 border',
                  o.statut==='bloque' ? 'bg-green-50 border-green-200' :
                  o.statut==='depasse' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {o.statut==='bloque' ? <CheckCircle size={16} className="text-green-600"/> :
                       o.statut==='depasse' ? <AlertTriangle size={16} className="text-red-600"/> :
                       <Clock size={16} className="text-orange-600"/>}
                      <div>
                        <p className="text-xs font-bold text-slate-700">{o.operateur} — {Array.isArray(o.liste_sim_json) ? o.liste_sim_json.length : '?'} MSISDN</p>
                        <p className="text-[10px] text-slate-400">Émis le {new Date(o.date_emission).toLocaleString('fr-FR')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded',
                        o.statut==='bloque' ? 'bg-green-100 text-green-700' :
                        o.statut==='depasse' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>
                        {o.statut==='bloque' ? 'BLOQUÉ' : o.statut==='depasse' ? 'DÉLAI DÉPASSÉ' : `${o.delai_restant_heures}h restantes`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Émettre un ordre de blocage — {operateur}</h2>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Délai de blocage</label>
              <div className="flex gap-2">
                {[24,48,72].map(h => (
                  <button key={h} onClick={() => setDelai(h)}
                    className={cn('px-4 py-2 rounded-lg text-sm font-bold border transition-all',
                      delai===h ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600')}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                MSISDN à bloquer ({simsFiltered.length} disponibles)
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                {simsFiltered.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-4">Aucune MSISDN confirmée pour {operateur}</p>
                  : simsFiltered.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={selected.includes(s.numero_sim)}
                      onChange={e => setSelected(p => e.target.checked ? [...p, s.numero_sim] : p.filter(x => x !== s.numero_sim))}
                      className="rounded"/>
                    <span className="font-mono text-xs font-bold text-slate-700">{s.numero_sim}</span>
                    <span className="text-xs text-red-600 font-bold">{s.score_suspicion}%</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={emettre} disabled={busy||selected.length===0}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                {busy ? 'Émission...' : `Émettre l'ordre (${selected.length} MSISDN)`}
              </Button>
              <Button variant="outline" onClick={() => setModal(false)} className="flex-1">Annuler</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
export default ArpceBlocking;
