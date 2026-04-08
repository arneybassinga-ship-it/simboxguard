import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface SimAnalysis {
  id: string; numero_sim: string; operateur: string;
  score_suspicion: number; niveau_alerte: string;
  statut: string; date_analyse: string; date_decision?: string;
  motif_refus?: string; details_refus?: string; criteres: any;
}

const History = () => {
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');

  useEffect(() => {
    fetch('http://localhost:4000/api/cdr/analyses')
      .then(r => r.json()).then(setAnalyses).finally(() => setLoading(false));
  }, []);

  const filtered = analyses.filter(a => {
    if (filtre === 'tous') return a.statut !== 'en_attente';
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
        <div className="bg-red-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-red-600"/>
            <p className="text-xs text-slate-500 font-medium">SimBox confirmées</p>
          </div>
          <p className="text-3xl font-bold text-red-600">{stats.confirmees}</p>
        </div>
        <div className="bg-orange-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className="text-orange-600"/>
            <p className="text-xs text-slate-500 font-medium">Faux positifs refusés</p>
          </div>
          <p className="text-3xl font-bold text-orange-600">{stats.refusees}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-600"/>
            <p className="text-xs text-slate-500 font-medium">En attente</p>
          </div>
          <p className="text-3xl font-bold text-blue-600">{stats.en_attente}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {['tous','confirmee','refusee'].map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtre===f ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500')}>
            {f === 'tous' ? 'TOUS' : f === 'confirmee' ? 'CONFIRMÉES' : 'REFUSÉES'}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">
          Décisions prises <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
        </CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-slate-400">Chargement...</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>SIM</TableHead>
                <TableHead>Opérateur</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Décision</TableHead>
                <TableHead>Motif refus</TableHead>
                <TableHead>Date décision</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length > 0 ? filtered.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-bold text-xs">{item.numero_sim}</TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                        item.operateur==='MTN'?'bg-yellow-100 text-yellow-800':'bg-red-100 text-red-700')}>
                        {item.operateur}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-bold">{item.score_suspicion}%</TableCell>
                    <TableCell>
                      <span className={cn('flex items-center gap-1 text-xs font-bold',
                        item.statut==='confirmee' ? 'text-red-600' : 'text-orange-500')}>
                        {item.statut==='confirmee'
                          ? <><CheckCircle size={12}/> SimBox confirmée</>
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
