import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertOctagon, AlertTriangle, CheckCircle } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { BlockingOrder, Sanction } from '../../types';
import { apiUrl } from '../../lib/api';

const ArpceSanctions = () => {
  const [ordres, setOrdres]       = useState<BlockingOrder[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState('');

  const loadData = () => {
    Promise.all([
      fetch(apiUrl('/api/ordres')).then(r => r.json()),
      fetch(apiUrl('/api/sanctions')).then(r => r.json()),
    ]).then(([o, s]) => { setOrdres(o); setSanctions(s); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const envoyer = async (ordre: BlockingOrder) => {
    setBusy(ordre.id);
    try {
      const resp = await fetch(apiUrl('/api/sanctions/avertir'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordre_id: ordre.id, operateur: ordre.operateur }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.error); }
      showSuccess(`Avertissement envoyé à ${ordre.operateur} ✓`);
      loadData();
    } catch (e) { showError(e instanceof Error ? e.message : 'Erreur'); }
    setBusy('');
  };

  const depasses = ordres.filter(o =>
    o.statut === 'depasse' || (o.statut === 'en_attente' && (o.delai_restant_heures ?? 1) === 0)
  );

  return (
    <DashboardLayout title="Sanctions — ARPCE">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-red-400"/>
            <p className="text-xs text-slate-400">Délais dépassés</p>
          </div>
          <p className="text-3xl font-bold text-red-400">{depasses.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertOctagon size={14} className="text-purple-400"/>
            <p className="text-xs text-slate-400">Sanctions émises</p>
          </div>
          <p className="text-3xl font-bold text-purple-400">{sanctions.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-green-400"/>
            <p className="text-xs text-slate-400">Ordres conformes</p>
          </div>
          <p className="text-3xl font-bold text-green-400">{ordres.filter(o => o.statut === 'bloque').length}</p>
        </div>
      </div>

      {/* Ordres délai dépassé */}
      <Card className="bg-white/5 border-white/10 mb-5">
        <CardHeader>
          <CardTitle className="text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={14}/> Ordres avec délai dépassé
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm">Chargement...</p>
          ) : depasses.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-2"/>
              <p className="text-slate-400 text-sm">Aucun délai dépassé. Tous les opérateurs sont conformes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {depasses.map(o => (
                <div key={o.id} className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={14} className="text-red-400"/>
                      <span className="text-xs font-bold text-red-400">{o.operateur} — Délai dépassé</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Émis le {new Date(o.date_emission).toLocaleString('fr-FR')} — Limite : {new Date(o.date_limite).toLocaleString('fr-FR')}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(Array.isArray(o.liste_sim_json) ? o.liste_sim_json : []).map((sim: string) => (
                        <span key={sim} className="font-mono text-[10px] bg-white/5 border border-red-500/30 text-red-300 px-2 py-0.5 rounded">
                          {sim}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" disabled={busy === o.id} onClick={() => envoyer(o)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0 ml-4">
                    {busy === o.id ? '...' : '⚡ Envoyer avertissement'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique sanctions */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <AlertOctagon size={14} className="text-purple-400"/> Historique des sanctions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm">Chargement...</p>
          ) : sanctions.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Aucune sanction émise.</p>
          ) : (
            <div className="space-y-2">
              {sanctions.map(s => (
                <div key={s.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertOctagon size={12} className="text-purple-400"/>
                      <span className="text-xs font-bold text-white">{s.operateur} — {s.type}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{new Date(s.date_sanction).toLocaleString('fr-FR')}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{s.log_details}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 shrink-0 ml-3">
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
