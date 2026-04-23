import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import type { SimAnalysis } from '../../types';
import { apiUrl } from '../../lib/api';

const History = () => {
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');

  useEffect(() => {
    fetch(apiUrl('/api/cdr/analyses'))
      .then(r => r.json()).then(setAnalyses).finally(() => setLoading(false));
  }, []);

  const filtered = analyses.filter(a => {
    if (filtre === 'tous') return true;
    return a.statut === filtre;
  });

  const stats = {
    confirmees: analyses.filter(a => a.statut === 'confirmee').length,
    refusees: analyses.filter(a => a.statut === 'refusee').length,
    en_attente: analyses.filter(a => a.statut === 'en_attente').length,
  };

  return (
    <DashboardLayout title="Historique des décisions">
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-red-400"/>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SIMs frauduleuses</p>
          </div>
          <p className="text-3xl font-black text-red-400">{stats.confirmees}</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className="text-orange-400"/>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Faux positifs refusés</p>
          </div>
          <p className="text-3xl font-black text-orange-400">{stats.refusees}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-400"/>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">En attente</p>
          </div>
          <p className="text-3xl font-black text-blue-400">{stats.en_attente}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {['tous','confirmee','refusee'].map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtre===f ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30')}>
            {f === 'tous' ? 'TOUS' : f === 'confirmee' ? 'FRAUDULEUSES' : 'REFUSÉES'}
          </button>
        ))}
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader><CardTitle className="text-lg text-white">
          Décisions prises <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
        </CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400">Chargement...</p> : (
            <Table>
              <TableHeader><TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-400">MSISDN</TableHead>
                <TableHead className="text-slate-400">Opérateur</TableHead>
                <TableHead className="text-slate-400">Score</TableHead>
                <TableHead className="text-slate-400">Décision</TableHead>
                <TableHead className="text-slate-400">Motif refus</TableHead>
                <TableHead className="text-slate-400">Date décision</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length > 0 ? filtered.map(item => (
                  <TableRow key={item.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-mono font-bold text-xs text-white">{item.numero_sim}</TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                        item.operateur==='MTN'?'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20':'bg-red-500/10 text-red-400 border border-red-500/20')}>
                        {item.operateur}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-white">{item.score_suspicion}%</TableCell>
                    <TableCell>
                      <span className={cn('flex items-center gap-1 text-xs font-bold',
                        item.statut==='confirmee' ? 'text-red-400' : 'text-orange-400')}>
                        {item.statut==='confirmee'
                          ? <><CheckCircle size={12}/> SIM frauduleuse</>
                          : <><XCircle size={12}/> Faux positif</>}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {item.motif_refus || '-'}
                      {item.details_refus && <p className="text-[10px] text-slate-400 mt-0.5">{item.details_refus}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {item.date_decision ? new Date(item.date_decision).toLocaleString('fr-FR') : new Date(item.date_analyse).toLocaleString('fr-FR')}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">
                    Aucune décision prise pour l'instant.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};
export default History;
