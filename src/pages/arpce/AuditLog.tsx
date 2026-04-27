import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Shield, Filter, RefreshCw, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface AuditEntry {
  id: string;
  user_id: string;
  user_nom: string;
  user_role: string;
  action: string;
  entite_type: string | null;
  entite_id: string | null;
  operateur: string | null;
  details_json: Record<string, unknown> | null;
  ip_address: string | null;
  date_action: string;
}

const ACTION_META: Record<string, { label: string; color: string }> = {
  IMPORT_CDR:           { label: 'Import CDR',         color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  AGREGER_CDR:          { label: 'Agrégation CDR',      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  DETECTER_SIMBOX:      { label: 'Détection SimBox',    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  CONFIRMER_SIM:        { label: 'SIM confirmée',       color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  REFUSER_SIM:          { label: 'SIM refusée',         color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  VALIDER_SIMBOX:       { label: 'SimBox validée',      color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  REJETER_SIMBOX:       { label: 'SimBox rejetée',      color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  GENERER_RAPPORT:      { label: 'Rapport généré',      color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  ENVOYER_RAPPORT:      { label: 'Rapport envoyé',      color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  ENVOYER_RAPPORT_ARPCE:{ label: 'Rapport → ARPCE',    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  ENVOYER_RAPPORT_AGENT:{ label: 'Rapport → Opérateur',color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  EMETTRE_BLOCAGE:      { label: 'Ordre de blocage',    color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  CONFIRMER_BLOCAGE:    { label: 'Blocage confirmé',    color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  EMETTRE_SANCTION:     { label: 'Sanction émise',      color: 'bg-rose-600/10 text-rose-300 border-rose-500/20' },
};

const ROLE_COLORS: Record<string, string> = {
  AGENT_MTN:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  AGENT_AIRTEL: 'bg-red-500/10 text-red-400 border-red-500/20',
  ANALYSTE:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ARPCE:        'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const PAGE_SIZE = 25;

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });

const fmtDetails = (d: Record<string, unknown> | null): string => {
  if (!d) return '—';
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
};

const AuditLog = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<AuditEntry | null>(null);

  const [filtreAction, setFiltreAction] = useState('');
  const [filtreRole, setFiltreRole] = useState('');
  const [filtreOp, setFiltreOp] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtreAction) params.set('action', filtreAction);
    if (filtreRole)   params.set('user_role', filtreRole);
    if (filtreOp)     params.set('operateur', filtreOp);
    if (dateDebut)    params.set('date_debut', dateDebut);
    if (dateFin)      params.set('date_fin', dateFin);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((page - 1) * PAGE_SIZE));

    apiFetch(`/api/audit?${params.toString()}`)
      .then(r => r.json())
      .then(data => { setLogs(data.logs || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filtreAction, filtreRole, filtreOp, dateDebut, dateFin, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFiltres = () => {
    setFiltreAction(''); setFiltreRole(''); setFiltreOp('');
    setDateDebut(''); setDateFin(''); setPage(1);
  };

  return (
    <DashboardLayout title="Journal d'audit">
      {/* En-tête stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Entrées totales', value: total },
          { label: 'Page courante', value: `${page} / ${totalPages}` },
          { label: 'Résultats affichés', value: logs.length },
          { label: 'Taille page', value: PAGE_SIZE },
        ].map(s => (
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">{s.label}</div>
            <div className="text-xl font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <Card className="bg-white/5 border-white/10 mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-1.5 text-slate-400 self-center">
              <Filter size={14} /> <span className="text-xs font-bold uppercase tracking-wider">Filtres</span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Action</label>
              <select value={filtreAction} onChange={e => { setFiltreAction(e.target.value); setPage(1); }}
                className="bg-white/5 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-w-[160px]">
                <option value="" className="bg-slate-900">Toutes</option>
                {Object.entries(ACTION_META).map(([k, v]) => (
                  <option key={k} value={k} className="bg-slate-900">{v.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Rôle</label>
              <select value={filtreRole} onChange={e => { setFiltreRole(e.target.value); setPage(1); }}
                className="bg-white/5 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                <option value="" className="bg-slate-900">Tous</option>
                {['AGENT_MTN', 'AGENT_AIRTEL', 'ANALYSTE', 'ARPCE'].map(r => (
                  <option key={r} value={r} className="bg-slate-900">{r.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Opérateur</label>
              <select value={filtreOp} onChange={e => { setFiltreOp(e.target.value); setPage(1); }}
                className="bg-white/5 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                <option value="" className="bg-slate-900">Tous</option>
                {['MTN', 'AIRTEL'].map(o => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Du</label>
              <input type="date" value={dateDebut} onChange={e => { setDateDebut(e.target.value); setPage(1); }}
                className="bg-white/5 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Au</label>
              <input type="date" value={dateFin} onChange={e => { setDateFin(e.target.value); setPage(1); }}
                className="bg-white/5 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>

            <div className="flex gap-2 self-end">
              <Button size="sm" variant="outline" onClick={resetFiltres}
                className="text-xs h-8 border-white/20 text-slate-400 hover:text-white hover:bg-white/10">
                Réinitialiser
              </Button>
              <Button size="sm" variant="outline" onClick={fetchLogs}
                className="text-xs h-8 border-purple-500/30 bg-purple-500/10 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 gap-1">
                <RefreshCw size={11} /> Actualiser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Shield size={18} className="text-purple-400" />
            Entrées du journal
            <span className="text-sm font-normal text-slate-400">({total} au total)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <div className="w-6 h-6 border-2 border-purple-500/50 border-t-purple-400 rounded-full animate-spin" />
              <span className="text-sm">Chargement...</span>
            </div>
          ) : (
            <>
              <div className="rounded-xl overflow-hidden border border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent bg-white/5">
                      <TableHead className="text-slate-400 text-[11px]">Date / Heure</TableHead>
                      <TableHead className="text-slate-400 text-[11px]">Utilisateur</TableHead>
                      <TableHead className="text-slate-400 text-[11px]">Rôle</TableHead>
                      <TableHead className="text-slate-400 text-[11px]">Action</TableHead>
                      <TableHead className="text-slate-400 text-[11px]">Opérateur</TableHead>
                      <TableHead className="text-slate-400 text-[11px]">Détails</TableHead>
                      <TableHead className="text-slate-400 text-[11px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                          Aucune entrée dans le journal.
                        </TableCell>
                      </TableRow>
                    ) : logs.map(entry => {
                      const meta = ACTION_META[entry.action] || { label: entry.action, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
                      return (
                        <TableRow key={entry.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-[11px] text-slate-300 whitespace-nowrap font-mono">
                            {fmtDate(entry.date_action)}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-bold text-white">{entry.user_nom}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{entry.user_id}</div>
                          </TableCell>
                          <TableCell>
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold border',
                              ROLE_COLORS[entry.user_role] || 'bg-slate-500/10 text-slate-400 border-slate-500/20')}>
                              {entry.user_role.replace('_', ' ')}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', meta.color)}>
                              {meta.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            {entry.operateur ? (
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold border',
                                entry.operateur === 'MTN'
                                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/20')}>
                                {entry.operateur}
                              </span>
                            ) : <span className="text-slate-600 text-[11px]">—</span>}
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-400 max-w-xs truncate">
                            {fmtDetails(entry.details_json)}
                          </TableCell>
                          <TableCell>
                            {entry.details_json && (
                              <button onClick={() => setDetailRow(entry)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-purple-400 transition-colors">
                                <Info size={13} />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-slate-500">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} sur {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                      className="h-8 px-3 text-xs border-white/15 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 gap-1">
                      <ChevronLeft size={13} /> Préc.
                    </Button>
                    <span className="text-xs text-slate-400 px-2">{page} / {totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                      className="h-8 px-3 text-xs border-white/15 text-slate-400 hover:text-white hover:border-white/30 disabled:opacity-30 gap-1">
                      Suiv. <ChevronRight size={13} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal détails */}
      {detailRow && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-0.5">Détails de l'action</div>
                <div className="text-sm font-bold text-white">
                  {ACTION_META[detailRow.action]?.label || detailRow.action}
                </div>
              </div>
              <button onClick={() => setDetailRow(null)}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Utilisateur</div>
                  <div className="font-bold text-white">{detailRow.user_nom}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{detailRow.user_id}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Date</div>
                  <div className="font-mono text-xs text-slate-200">{fmtDate(detailRow.date_action)}</div>
                </div>
              </div>

              {detailRow.entite_id && (
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Entité ({detailRow.entite_type})
                  </div>
                  <div className="font-mono text-xs text-slate-300 break-all">{detailRow.entite_id}</div>
                </div>
              )}

              {detailRow.details_json && (
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Données</div>
                  <div className="space-y-1.5">
                    {Object.entries(detailRow.details_json)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center">
                          <span className="text-[11px] text-slate-400">{k}</span>
                          <span className="text-[11px] font-bold text-white font-mono">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {detailRow.ip_address && (
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">IP</div>
                  <div className="font-mono text-xs text-slate-300">{detailRow.ip_address}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AuditLog;
