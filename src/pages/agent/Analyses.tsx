import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText } from 'lucide-react';
import { showError } from '../../utils/toast';
import { User, SimAnalysis } from '../../types';
import { cn } from '@/lib/utils';
import { apiUrl } from '../../lib/api';

const AgentAnalyses = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const operateur = user.operateur;
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/cdr/analyses'))
      .then(r => r.json())
      .then((data: SimAnalysis[]) => {
        // l'agent ne voit que ses propres MSISDN (filtrées par opérateur)
        setAnalyses(data.filter(a => !operateur || a.operateur === operateur));
      })
      .catch(() => showError('Erreur chargement des analyses'))
      .finally(() => setLoading(false));
  }, [operateur]);

  const confirmees = analyses.filter(a => a.statut === 'confirmee');

  return (
    <DashboardLayout title="Mes Analyses Reçues">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-white">{analyses.length}</p>
          <p className="text-xs text-slate-400 mt-1">Total MSISDN analysées</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-red-400">{confirmees.length}</p>
          <p className="text-xs text-slate-400 mt-1">SIMs frauduleuses</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-green-400">
            {analyses.filter(a => a.statut === 'refusee').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Faux positifs</p>
        </div>
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FileText size={16} className="text-blue-400" />
            Résultats d'analyse — {operateur}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm py-8 text-center">Chargement...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MSISDN</TableHead>
                  <TableHead>Date analyse</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.length > 0 ? analyses.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs font-bold">{a.numero_sim}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {new Date(a.date_analyse).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', a.score_suspicion >= 60 ? 'bg-red-500' : a.score_suspicion >= 40 ? 'bg-orange-400' : 'bg-green-400')}
                            style={{ width: `${a.score_suspicion}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-white">{a.score_suspicion}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                        a.niveau_alerte === 'critique' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        a.niveau_alerte === 'elevee' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                        'bg-green-500/20 text-green-400 border border-green-500/30')}>
                        {a.niveau_alerte}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                        a.statut === 'confirmee' ? 'bg-red-500/20 text-red-400' :
                        a.statut === 'refusee' ? 'bg-green-500/20 text-green-400' :
                        'bg-blue-500/20 text-blue-400')}>
                        {a.statut === 'en_attente' ? 'En attente' : a.statut === 'confirmee' ? 'SimBox ✓' : 'Faux positif'}
                      </span>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                      Aucune analyse disponible. Importez un fichier CDR puis lancez une agrégation.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AgentAnalyses;
