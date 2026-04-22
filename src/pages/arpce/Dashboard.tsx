import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Clock, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { showError } from '../../utils/toast';
import { SimAnalysis, BlockingOrder, Sanction } from '../../types';
import { apiUrl } from '../../lib/api';

const ARPCEDashboard = () => {
  const [analyses, setAnalyses] = useState<SimAnalysis[]>([]);
  const [ordres, setOrdres] = useState<BlockingOrder[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/api/cdr/analyses')).then(r => r.json()),
      fetch(apiUrl('/api/ordres')).then(r => r.json()),
      fetch(apiUrl('/api/sanctions')).then(r => r.json()),
    ]).then(([a, o, s]) => {
      setAnalyses(a); setOrdres(o); setSanctions(s);
    }).catch(() => showError('Erreur chargement'))
    .finally(() => setLoading(false));
  }, []);

  const stats = {
    confirmees: analyses.filter(a => a.statut === 'confirmee').length,
    ordres_total: ordres.length,
    ordres_bloques: ordres.filter(o => o.statut === 'bloque').length,
    ordres_depasses: ordres.filter(o => o.statut === 'depasse').length,
    sanctions_total: sanctions.length,
    en_attente: ordres.filter(o => o.statut === 'en_attente').length,
  };

  const opData = [
    { name: 'MTN', confirmees: analyses.filter(a => a.operateur==='MTN' && a.statut==='confirmee').length, ordres: ordres.filter(o => o.operateur==='MTN').length },
    { name: 'AIRTEL', confirmees: analyses.filter(a => a.operateur==='AIRTEL' && a.statut==='confirmee').length, ordres: ordres.filter(o => o.operateur==='AIRTEL').length },
  ];

  const CARDS = [
    { label: 'SIMs frauduleuses', value: stats.confirmees, icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Ordres émis', value: stats.ordres_total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Blocages effectués', value: stats.ordres_bloques, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'En attente de blocage', value: stats.en_attente, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Délais dépassés', value: stats.ordres_depasses, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Sanctions émises', value: stats.sanctions_total, icon: AlertTriangle, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <DashboardLayout title="Dashboard ARPCE">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {CARDS.map(c => (
          <div key={c.label} className={`rounded-2xl p-4 ${c.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-medium">{c.label}</p>
              <c.icon size={16} className={c.color} />
            </div>
            <p className={`text-3xl font-bold ${c.color}`}>{loading ? '...' : c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">SIMs frauduleuses par opérateur</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={opData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Bar dataKey="confirmees" name="SIMs frauduleuses" radius={[4,4,0,0]}>
                  <Cell fill="#FBBF24" />
                  <Cell fill="#EF4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ordres de blocage par opérateur</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={opData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Bar dataKey="ordres" name="Ordres émis" radius={[4,4,0,0]}>
                  <Cell fill="#3B82F6" />
                  <Cell fill="#8B5CF6" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};
export default ARPCEDashboard;
