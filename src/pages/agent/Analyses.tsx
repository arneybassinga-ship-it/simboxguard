import React from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MOCK_ANALYSES } from '../../store/mockData';
import { User } from '../../types';
import { cn } from '@/lib/utils';

const AgentAnalyses = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const myAnalyses = MOCK_ANALYSES.filter(a => a.operateur === user.operateur && a.statut === 'confirmee');

  return (
    <DashboardLayout title="Mes Analyses Reçues">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rapports d'Analyse Fraude</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Numéro SIM</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myAnalyses.map((analysis) => (
                <TableRow key={analysis.id}>
                  <TableCell className="text-xs">
                    {new Date(analysis.date_analyse).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium">{analysis.numero_sim}</TableCell>
                  <TableCell>
                    <span className="font-bold text-red-600">{analysis.score_suspicion}%</span>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold uppercase",
                      analysis.niveau_alerte === 'critique' ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                    )}>
                      {analysis.niveau_alerte}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye size={16} className="mr-2" />
                        Voir
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download size={16} className="mr-2" />
                        PDF
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {myAnalyses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                    Aucun rapport d'analyse reçu pour le moment.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AgentAnalyses;