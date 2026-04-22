import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Users, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { SimboxDetection } from '../../types';
import { cn } from '@/lib/utils';
import { apiUrl } from '../../lib/api';

const NIVEAU_CONFIG = {
  confirme: { label: 'Confirmé', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
  probable: { label: 'Probable', bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
  suspect:  { label: 'Suspect',  bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
};

const MOTIFS_REJET = [
  'Call center légal enregistré',
  'Entreprise à volume élevé',
  'Faux positif — coïncidence de contacts',
  'MSISDN testées par le réseau',
  'Autre (préciser)',
];

const normalizeItem = (item: Partial<SimboxDetection>): SimboxDetection => ({
  id: item.id ?? '',
  periode_debut: item.periode_debut ?? '',
  periode_fin: item.periode_fin ?? '',
  operateur: item.operateur ?? 'TOUS',
  agent_id: item.agent_id ?? '',
  sims: Array.isArray(item.sims) ? item.sims : [],
  nb_sims: item.nb_sims ?? (Array.isArray(item.sims) ? item.sims.length : 0),
  similarite_moyenne: item.similarite_moyenne ?? 0,
  score_rotation: item.score_rotation ?? 0,
  score_global: item.score_global ?? 0,
  niveau: item.niveau ?? 'suspect',
  statut: item.statut ?? 'en_attente',
  motif_rejet: item.motif_rejet,
  date_detection: item.date_detection ?? '',
  contacts_communs: Array.isArray(item.contacts_communs) ? item.contacts_communs : [],
});

const SimboxCard = ({
  item, onValider, onRefuser, busy,
}: {
  item: SimboxDetection;
  onValider: (id: string) => void;
  onRefuser: (item: SimboxDetection) => void;
  busy: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const cfg = NIVEAU_CONFIG[item.niveau];

  return (
    <div className={cn('rounded-xl border p-4', cfg.bg, cfg.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border', cfg.bg, cfg.border, cfg.text)}>
              {cfg.label}
            </span>
            <span className="text-[10px] text-slate-500">Score {item.score_global}/100</span>
          </div>
          <p className="text-sm font-bold text-white">
            {item.nb_sims} MSISDN — {item.operateur}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Période : {new Date(item.periode_debut).toLocaleDateString('fr-FR')} →{' '}
            {new Date(item.periode_fin).toLocaleDateString('fr-FR')}
            {' · '}Similarité {item.similarite_moyenne}% · Rotation {item.score_rotation}%
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {item.statut === 'en_attente' && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onValider(item.id)}
                className="bg-red-500 hover:bg-red-400 text-white text-xs h-7 px-2 gap-1">
                <CheckCircle size={11} /> Valider
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onRefuser(item)}
                className="text-xs h-7 px-2 gap-1 border-orange-500/30 bg-orange-500/10 hover:border-orange-400 hover:bg-orange-500/20 hover:text-orange-300 text-orange-400">
                <XCircle size={11} /> Rejeter
              </Button>
            </>
          )}
          {item.statut === 'validee' && (
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">
              Validée ✓
            </span>
          )}
          {item.statut === 'rejetee' && (
            <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded">
              Rejetée
            </span>
          )}
          <button onClick={() => setOpen(v => !v)} className="p-1 text-slate-400 hover:text-white ml-1">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Users size={10} /> MSISDN du groupe
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.sims.map(sim => (
                <span key={sim} className="font-mono text-[10px] bg-white/5 text-slate-300 px-2 py-0.5 rounded border border-white/10">
                  {sim}
                </span>
              ))}
            </div>
          </div>
          {item.contacts_communs.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                Contacts en commun ({item.contacts_communs.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.contacts_communs.slice(0, 8).map(c => (
                  <span key={c} className="font-mono text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                    {c}
                  </span>
                ))}
                {item.contacts_communs.length > 8 && (
                  <span className="text-[10px] text-slate-500">+{item.contacts_communs.length - 8} autres</span>
                )}
              </div>
            </div>
          )}
          {item.motif_rejet && (
            <p className="text-xs text-slate-400 italic">Motif rejet : {item.motif_rejet}</p>
          )}
        </div>
      )}
    </div>
  );
};

const SimboxValidation = () => {
  const [items, setItems] = useState<SimboxDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<'tous' | 'en_attente' | 'validee' | 'rejetee'>('en_attente');
  const [busy, setBusy] = useState(false);
  const [modalRejet, setModalRejet] = useState<SimboxDetection | null>(null);
  const [motif, setMotif] = useState(MOTIFS_REJET[0]);
  const [details, setDetails] = useState('');

  const load = () => {
    setLoading(true);
    fetch(apiUrl('/api/simbox'))
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(data?.error || 'Erreur lors du chargement des simbox détectées');
        }
        if (!Array.isArray(data)) {
          throw new Error('Réponse invalide reçue depuis le serveur');
        }
        setItems(data.map((item) => normalizeItem(item)));
      })
      .catch((err) => showError(err instanceof Error ? err.message : 'Erreur chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => filtre === 'tous' || i.statut === filtre);

  const handleValider = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/simbox/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'validee' }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      setItems(p => p.map(i => i.id === id ? { ...i, statut: 'validee' } : i));
      showSuccess('Simbox validée — transmise à l\'ARPCE');
    } catch (e) { showError(e instanceof Error ? e.message : 'Erreur'); }
    setBusy(false);
  };

  const handleRejeter = async () => {
    if (!modalRejet) return;
    setBusy(true);
    const motifFinal = motif === 'Autre (préciser)' ? details || motif : motif;
    try {
      const r = await fetch(apiUrl(`/api/simbox/${modalRejet.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'rejetee', motif_rejet: motifFinal }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      setItems(p => p.map(i => i.id === modalRejet.id ? { ...i, statut: 'rejetee', motif_rejet: motifFinal } : i));
      showSuccess('Groupe classé faux positif');
      setModalRejet(null); setDetails(''); setMotif(MOTIFS_REJET[0]);
    } catch (e) { showError(e instanceof Error ? e.message : 'Erreur'); }
    setBusy(false);
  };

  const enAttente = items.filter(i => i.statut === 'en_attente').length;

  return (
    <DashboardLayout title="Validation Simbox">
      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-yellow-400">{enAttente}</p>
          <p className="text-xs text-slate-400 mt-1">En attente</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-red-400">{items.filter(i => i.statut === 'validee').length}</p>
          <p className="text-xs text-slate-400 mt-1">Validées</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-green-400">{items.filter(i => i.statut === 'rejetee').length}</p>
          <p className="text-xs text-slate-400 mt-1">Rejetées</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Filter size={14} className="text-slate-400" />
        {(['tous', 'en_attente', 'validee', 'rejetee'] as const).map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
              filtre === f ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30')}>
            {f === 'tous' ? 'Tous' : f === 'en_attente' ? 'En attente' : f === 'validee' ? 'Validés' : 'Rejetés'}
          </button>
        ))}
      </div>

      {/* Liste */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base">
            Groupes simbox détectés
            <span className="text-sm font-normal text-slate-400 ml-2">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm py-8 text-center">Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-10 text-slate-500 text-sm">
              {filtre === 'en_attente' ? 'Aucun groupe en attente de validation.' : 'Aucun résultat.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map(item => (
                <SimboxCard
                  key={item.id}
                  item={item}
                  onValider={handleValider}
                  onRefuser={setModalRejet}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal rejet */}
      {modalRejet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-white mb-1">Rejeter ce groupe</h2>
            <p className="text-xs text-slate-400 mb-4">
              {modalRejet.nb_sims} MSISDN — score {modalRejet.score_global}/100
            </p>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Motif</label>
              <select value={motif} onChange={e => setMotif(e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500">
                {MOTIFS_REJET.map(m => <option key={m} className="bg-slate-900">{m}</option>)}
              </select>
            </div>
            {motif === 'Autre (préciser)' && (
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Préciser</label>
                <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3}
                  placeholder="Expliquez pourquoi c'est un faux positif..."
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 resize-none" />
              </div>
            )}
            <div className="flex gap-3 mt-2">
              <Button onClick={handleRejeter} disabled={busy} className="flex-1 bg-orange-500 hover:bg-orange-400 text-white">
                {busy ? 'Enregistrement...' : 'Confirmer le rejet'}
              </Button>
              <Button variant="outline" onClick={() => setModalRejet(null)}
                className="flex-1 border-white/20 text-white hover:bg-white/10">
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default SimboxValidation;
