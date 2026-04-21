import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { ShieldAlert, CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react';
import { showError } from '../../utils/toast';
import { SimAnalysis } from '../../types';
import { apiUrl } from '../../lib/api';

const AnalysteDashboard = () => {
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/cdr/analyses'))
      .then(r => r.json()).then(setAnalyses)
      .catch(() => showError('Erreur chargement'))
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: analyses.length,
    en_attente: analyses.filter(a => a.statut === 'en_attente').length,
    confirmees: analyses.filter(a => a.statut === 'confirmee').length,
    refusees: analyses.filter(a => a.statut === 'refusee').length,
    critiques: analyses.filter(a => a.niveau_alerte === 'critique').length,
    elevees: analyses.filter(a => a.niveau_alerte === 'elevee').length,
    score_moyen: analyses.length > 0 ? Math.round(analyses.reduce((s, a) => s + a.score_suspicion, 0) / analyses.length) : 0,
  };

  const pieData = [
    { name: 'En attente', value: stats.en_attente, color: '#3B82F6' },
    { name: 'Confirmées', value: stats.confirmees, color: '#EF4444' },
    { name: 'Refusées', value: stats.refusees, color: '#F97316' },
  ].filter(d => d.value > 0);

  const barData = [
    { label: 'Normale', count: analyses.filter(a => a.niveau_alerte === 'normale').length, color: '#22c55e' },
    { label: 'Élevée', count: analyses.filter(a => a.niveau_alerte === 'elevee').length, color: '#f97316' },
    { label: 'Critique', count: analyses.filter(a => a.niveau_alerte === 'critique').length, color: '#ef4444' },
  ];

  const opData = [
    { name: 'MTN', count: analyses.filter(a => a.operateur === 'MTN').length },
    { name: 'AIRTEL', count: analyses.filter(a => a.operateur === 'AIRTEL').length },
  ];

  const CARDS = [
    { label: 'Total MSISDN analysées', value: stats.total, icon: ShieldAlert, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'En attente', value: stats.en_attente, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'SimBox confirmées', value: stats.confirmees, icon: CheckCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Faux positifs', value: stats.refusees, icon: XCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Alertes critiques', value: stats.critiques, icon: ShieldAlert, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Score moyen', value: `${stats.score_moyen}%`, icon: TrendingUp, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  return (
    <DashboardLayout title="Dashboard Analyste">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {CARDS.map(c => (
          <div key={c.label} className={`rounded-2xl p-4 ${c.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-medium">{c.label}</p>
              <c.icon size={16} className={c.color} />
            </div>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Répartition par niveau d'alerte</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Chargement...</div> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '0.5px solid #e2e8f0' }} />
                  <Bar dataKey="count" name="MSISDN" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Statut des décisions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Chargement...</div> :
             pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-slate-300 text-sm">Aucune donnée</div> : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">MSISDN par opérateur</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chargement...</div> : (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={opData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Bar dataKey="count" name="MSISDN" radius={[4, 4, 0, 0]}>
                  <Cell fill="#FBBF24" />
                  <Cell fill="#EF4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};
export default AnalysteDashboard;
