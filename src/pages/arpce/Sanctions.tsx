import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertOctagon, AlertTriangle, CheckCircle } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';

const ArpceSanctions = () => {
  const [ordres, setOrdres] = useState<any[]>([]);
  const [sanctions, setSanctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const loadData = () => {
    Promise.all([
      fetch('http://localhost:4000/api/ordres').then(r => r.json()),
      fetch('http://localhost:4000/api/sanctions').then(r => r.json()),
    ]).then(([o, s]) => { setOrdres(o); setSanctions(s); })
    .finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const envoyer = async (ordre: any) => {
    setBusy(ordre.id);
    try {
      const resp = await fetch('http://localhost:4000/api/sanctions/avertir', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ordre_id: ordre.id, operateur: ordre.operateur })
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error);
      }
      showSuccess(`Avertissement envoyé à ${ordre.operateur} ✓`);
      loadData();
    } catch (e: any) { showError(e.message || 'Erreur'); }
    setBusy('');
  };

  const depasses = ordres.filter(o => o.statut === 'depasse' || (o.statut === 'en_attente' && o.delai_restant_heures === 0));

  return (
    <DashboardLayout title="Sanctions — ARPCE">
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-red-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} className="text-red-600"/>
            <p className="text-xs text-slate-500">Délais dépassés</p></div>
          <p className="text-3xl font-bold text-red-600">{depasses.length}</p>
        </div>
        <div className="bg-purple-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><AlertOctagon size={14} className="text-purple-600"/>
            <p className="text-xs text-slate-500">Sanctions émises</p></div>
          <p className="text-3xl font-bold text-purple-600">{sanctions.length}</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><CheckCircle size={14} className="text-green-600"/>
            <p className="text-xs text-slate-500">Ordres conformes</p></div>
          <p className="text-3xl font-bold text-green-600">{ordres.filter(o => o.statut==='bloque').length}</p>
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader><CardTitle className="text-sm text-red-700">⚠ Ordres avec délai dépassé</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400 text-sm">Chargement...</p> :
           depasses.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-2"/>
              <p className="text-slate-400 text-sm">Aucun délai dépassé. Tous les opérateurs sont conformes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {depasses.map(o => (
                <div key={o.id} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={14} className="text-red-600"/>
                      <span className="text-xs font-bold text-red-700">{o.operateur} — Délai dépassé</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Émis le {new Date(o.date_emission).toLocaleString('fr-FR')} — Limite : {new Date(o.date_limite).toLocaleString('fr-FR')}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(Array.isArray(o.liste_sim_json) ? o.liste_sim_json : []).map((sim: string) => (
                        <span key={sim} className="font-mono text-[10px] bg-white border border-red-200 text-red-700 px-2 py-0.5 rounded">{sim}</span>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" disabled={busy===o.id} onClick={() => envoyer(o)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0 ml-4">
                    {busy===o.id ? '...' : '⚡ Envoyer avertissement'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Historique des sanctions</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400 text-sm">Chargement...</p> :
           sanctions.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Aucune sanction émise.</p> : (
            <div className="space-y-2">
              {sanctions.map(s => (
                <div key={s.id} className="bg-slate-50 rounded-xl p-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertOctagon size={12} className="text-purple-600"/>
                      <span className="text-xs font-bold text-slate-700">{s.operateur} — {s.type}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{new Date(s.date_sanction).toLocaleString('fr-FR')}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{s.log_details}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0 ml-3">
                    {s.type?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};
export default ArpceSanctions;
