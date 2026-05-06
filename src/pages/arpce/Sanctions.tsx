import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertOctagon, AlertTriangle, CheckCircle, Download, ShieldX } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { BlockingOrder, Sanction } from '../../types';
import { generateRapportSanction } from '../../lib/generatePDF';
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
      .catch(() => showError('Erreur chargement des données'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  /* Pour chaque ordre, détermine si un avertissement a déjà été émis */
  const hasAvertissement = (ordreId: string) =>
    sanctions.some(s => s.ordre_blocage_id === ordreId && s.type === 'avertissement');

  const hasMiseEnDemeure = (ordreId: string) =>
    sanctions.some(s => s.ordre_blocage_id === ordreId && s.type === 'mise_en_demeure');

  const envoyer = async (ordre: BlockingOrder) => {
    setBusy(ordre.id);
    try {
      const resp = await fetch(apiUrl('/api/sanctions/avertir'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordre_id: ordre.id, operateur: ordre.operateur }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.error); }
      const data = await resp.json();
      const label = data.type === 'mise_en_demeure' ? 'Mise en demeure' : 'Avertissement';
      showSuccess(`${label} envoyé à ${ordre.operateur} ✓`);
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
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-red-400"/>
            <p className="text-xs text-slate-400">Délais dépassés</p>
          </div>
          <p className="text-3xl font-bold text-red-400">{depasses.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertOctagon size={14} className="text-orange-400"/>
            <p className="text-xs text-slate-400">Avertissements</p>
          </div>
          <p className="text-3xl font-bold text-orange-400">
            {sanctions.filter(s => s.type === 'avertissement').length}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldX size={14} className="text-red-500"/>
            <p className="text-xs text-slate-400">Mises en demeure</p>
          </div>
          <p className="text-3xl font-bold text-red-500">
            {sanctions.filter(s => s.type === 'mise_en_demeure').length}
          </p>
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
              {depasses.map(o => {
                const dejaAverti   = hasAvertissement(o.id);
                const dejaMED      = hasMiseEnDemeure(o.id);
                const sanctionFaite = dejaMED;
                const btnLabel = dejaMED
                  ? '✓ Mise en demeure émise'
                  : dejaAverti
                    ? '⚠ Envoyer mise en demeure'
                    : '⚡ Envoyer avertissement';
                const btnClass = dejaMED
                  ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                  : dejaAverti
                    ? 'bg-red-700 hover:bg-red-800 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white';
                return (
                  <div key={o.id} className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <AlertTriangle size={14} className="text-red-400"/>
                          <span className="text-xs font-bold text-red-400">{o.operateur} — Délai dépassé</span>
                          {dejaAverti && !dejaMED && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 border border-orange-500/30 text-orange-400">
                              AVERTISSEMENT ÉMIS
                            </span>
                          )}
                          {dejaMED && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400">
                              MISE EN DEMEURE ÉMISE
                            </span>
                          )}
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
                      <Button size="sm" disabled={busy === o.id || sanctionFaite} onClick={() => envoyer(o)}
                        className={`text-xs shrink-0 ml-4 ${btnClass}`}>
                        {busy === o.id ? '...' : btnLabel}
                      </Button>
                    </div>
                  </div>
                );
              })}
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
              {sanctions.map(s => {
                const isMED = s.type === 'mise_en_demeure';
                return (
                  <div key={s.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isMED
                          ? <ShieldX size={12} className="text-red-500"/>
                          : <AlertOctagon size={12} className="text-orange-400"/>
                        }
                        <span className="text-xs font-bold text-white">{s.operateur} — {s.type.replace('_', ' ')}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{new Date(s.date_sanction).toLocaleString('fr-FR')}</p>
                      <p className="text-[11px] text-slate-400 mt-1 truncate">{s.log_details}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isMED
                          ? 'bg-red-500/20 border-red-500/30 text-red-400'
                          : 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                      }`}>
                        {s.type === 'mise_en_demeure' ? 'MISE EN DEMEURE' : 'AVERTISSEMENT'}
                      </span>
                      <button
                        onClick={() => generateRapportSanction(s, s.operateur)}
                        className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                        title="Télécharger PDF">
                        <Download size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};
export default ArpceSanctions;
