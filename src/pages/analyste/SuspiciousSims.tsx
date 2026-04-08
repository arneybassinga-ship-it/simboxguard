import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Filter } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { generateRapportAnalyseCDR } from '../../lib/generatePDF';

interface SimAnalysis {
  id: string; numero_sim: string; operateur: string;
  score_suspicion: number; niveau_alerte: string;
  statut: string; date_analyse: string; criteres: any;
}
const MOTIFS = ['Télévendeur professionnel','Call center légal','Volume exceptionnel ponctuel','Erreur de données CDR','SIM entreprise enregistrée','Autre (préciser)'];

const SuspiciousSims = () => {
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreOp, setFiltreOp] = useState('tous');
  const [filtreNiveau, setFiltreNiveau] = useState('tous');
  const [modalRefus, setModalRefus] = useState<SimAnalysis|null>(null);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const fetch_ = () => {
    setLoading(true);
    fetch('http://localhost:4000/api/cdr/analyses')
      .then(r => r.json()).then(setAnalyses).finally(() => setLoading(false));
  };
  useEffect(() => { fetch_(); }, []);

  const filtered = analyses.filter(a => {
    if (a.statut !== 'en_attente') return false;
    if (filtreOp !== 'tous' && a.operateur !== filtreOp) return false;
    if (filtreNiveau !== 'tous' && a.niveau_alerte !== filtreNiveau) return false;
    return true;
  });

  const confirmer = async (item: SimAnalysis) => {
    setBusy(true);
    try {
      await fetch(`http://localhost:4000/api/cdr/analyses/${item.id}`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ statut: 'confirmee' })
      });
      setAnalyses(p => p.map(a => a.id===item.id ? {...a, statut:'confirmee'} : a));
      showSuccess(`SIM ${item.numero_sim} confirmée SimBox ✓`);
    } catch { showError('Erreur confirmation'); }
    setBusy(false);
  };

  const refuser = async () => {
    if (!modalRefus) return;
    setBusy(true);
    try {
      await fetch(`http://localhost:4000/api/cdr/analyses/${modalRefus.id}`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ statut: 'refusee', motif_refus: motif, details_refus: details })
      });
      setAnalyses(p => p.map(a => a.id===modalRefus.id ? {...a, statut:'refusee'} : a));
      showSuccess('SIM classée faux positif');
      setModalRefus(null); setDetails(''); setMotif(MOTIFS[0]);
    } catch { showError('Erreur refus'); }
    setBusy(false);
  };

  return (
    <DashboardLayout title="SIMs Suspectes">
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Filter size={14} className="text-slate-400"/>
        {['tous','MTN','AIRTEL'].map(op => (
          <button key={op} onClick={() => setFiltreOp(op)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtreOp===op ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500')}>
            {op.toUpperCase()}
          </button>
        ))}
        <span className="ml-3 text-slate-300">|</span>
        {['tous','critique','elevee','normale'].map(n => (
          <button key={n} onClick={() => setFiltreNiveau(n)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtreNiveau===n ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500')}>
            {n.toUpperCase()}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">
          SIMs en attente <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
        </CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400">Chargement...</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>SIM</TableHead><TableHead>Opérateur</TableHead>
                <TableHead>Score</TableHead><TableHead>Niveau</TableHead>
                <TableHead>Durée moy.</TableHead><TableHead>App/h</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length > 0 ? filtered.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-bold text-xs">{item.numero_sim}</TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                        item.operateur==='MTN' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700')}>
                        {item.operateur}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', item.score_suspicion>=60?'bg-red-500':item.score_suspicion>=40?'bg-orange-400':'bg-green-400')}
                            style={{width:`${item.score_suspicion}%`}}/>
                        </div>
                        <span className="text-xs font-bold">{item.score_suspicion}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                        item.niveau_alerte==='critique'?'bg-red-100 text-red-800':item.niveau_alerte==='elevee'?'bg-orange-100 text-orange-800':'bg-green-100 text-green-800')}>
                        {item.niveau_alerte.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{item.criteres?.duree_moyenne ? `${Math.round(item.criteres.duree_moyenne)}s` : '-'}</TableCell>
                    <TableCell className="text-xs">{item.criteres?.appels_par_heure ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" disabled={busy} onClick={() => confirmer(item)}
                          className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 px-2 gap-1">
                          <CheckCircle size={11}/> Confirmer
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setModalRefus(item)}
                          className="text-xs h-7 px-2 gap-1 border-slate-300 hover:border-orange-400 hover:text-orange-600">
                          <XCircle size={11}/> Refuser
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">
                    Aucune SIM en attente.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {modalRefus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Refuser l'alerte</h2>
            <p className="text-sm text-slate-500 mb-4">SIM : <span className="font-mono font-bold">{modalRefus.numero_sim}</span></p>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Motif</label>
              <select value={motif} onChange={e => setMotif(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MOTIFS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="mb-6">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Détails</label>
              <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3}
                placeholder="Expliquez pourquoi c'est un faux positif..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>
            <div className="flex gap-3">
              <Button onClick={refuser} disabled={busy} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                {busy ? 'Enregistrement...' : 'Confirmer le refus'}
              </Button>
              <Button variant="outline" onClick={() => setModalRefus(null)} className="flex-1">Annuler</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
export default SuspiciousSims;
// PDF export déjà importé via generatePDF.ts
