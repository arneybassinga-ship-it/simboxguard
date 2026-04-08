import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShieldAlert, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';

interface Ordre {
  id: string; operateur: string; liste_sim_json: string[];
  delai_heures: number; date_emission: string; date_limite: string;
  statut: string; delai_restant_heures?: number;
}

const AgentBlocking = () => {
  const [ordres, setOrdres] = useState<Ordre[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const operateur = user.operateur ?? 'MTN';

  const loadOrdres = () => {
    fetch('http://localhost:4000/api/ordres')
      .then(r => r.json())
      .then(data => setOrdres(data.filter((o: Ordre) => o.operateur === operateur)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadOrdres(); }, []);

  const marquerBloque = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`http://localhost:4000/api/ordres/${id}/bloquer`, { method: 'PATCH' });
      showSuccess('SIM marquée comme bloquée ✓');
      loadOrdres();
    } catch { showError('Erreur'); }
    setBusy('');
  };

  const enAttente = ordres.filter(o => o.statut === 'en_attente');
  const bloques = ordres.filter(o => o.statut === 'bloque');
  const depasses = ordres.filter(o => o.statut === 'depasse');

  return (
    <DashboardLayout title="Ordres de Blocage Reçus">
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-orange-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-orange-600"/>
            <p className="text-xs text-slate-500">En attente</p></div>
          <p className="text-3xl font-bold text-orange-600">{enAttente.length}</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><CheckCircle size={14} className="text-green-600"/>
            <p className="text-xs text-slate-500">Bloqués</p></div>
          <p className="text-3xl font-bold text-green-600">{bloques.length}</p>
        </div>
        <div className="bg-red-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} className="text-red-600"/>
            <p className="text-xs text-slate-500">Délai dépassé</p></div>
          <p className="text-3xl font-bold text-red-600">{depasses.length}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Ordres reçus de l'ARPCE</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400 text-sm">Chargement...</p> :
          ordres.length === 0 ? (
            <div className="text-center py-12">
              <ShieldAlert size={32} className="text-slate-300 mx-auto mb-3"/>
              <p className="text-slate-400 text-sm">Aucun ordre de blocage reçu.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ordres.map(o => (
                <div key={o.id} className={cn('rounded-xl p-4 border',
                  o.statut==='bloque' ? 'bg-green-50 border-green-200' :
                  o.statut==='depasse' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200')}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {o.statut==='bloque' ? <CheckCircle size={14} className="text-green-600"/> :
                         o.statut==='depasse' ? <AlertTriangle size={14} className="text-red-600"/> :
                         <Clock size={14} className="text-orange-600"/>}
                        <span className={cn('text-xs font-bold',
                          o.statut==='bloque'?'text-green-700':o.statut==='depasse'?'text-red-700':'text-orange-700')}>
                          {o.statut==='bloque' ? 'BLOQUÉ' : o.statut==='depasse' ? '⚠ DÉLAI DÉPASSÉ' : `${o.delai_restant_heures}h restantes`}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mb-2">
                        Émis le {new Date(o.date_emission).toLocaleString('fr-FR')} — Limite : {new Date(o.date_limite).toLocaleString('fr-FR')}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(o.liste_sim_json) ? o.liste_sim_json : []).map((sim: string) => (
                          <span key={sim} className="font-mono text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                            {sim}
                          </span>
                        ))}
                      </div>
                    </div>
                    {o.statut === 'en_attente' && (
                      <Button size="sm" disabled={busy===o.id} onClick={() => marquerBloque(o.id)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs shrink-0">
                        {busy===o.id ? '...' : '✓ Marquer bloqué'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};
export default AgentBlocking;
