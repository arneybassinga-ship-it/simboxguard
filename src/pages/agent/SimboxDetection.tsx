import { useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ScanSearch, Loader2, ShieldAlert, Users, BarChart3,
  CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { User } from '../../types';
import { cn } from '@/lib/utils';
import { apiUrl } from '../../lib/api';

interface GroupeSimbox {
  id: string;
  sims: string[];
  nb_sims: number;
  similarite_moyenne: number;
  score_rotation: number;
  score_global: number;
  niveau: 'suspect' | 'probable' | 'confirme';
  contacts_communs: string[];
}

interface DetectionResult {
  nb_groupes: number;
  nb_sims_impliquees: number;
  nb_confirmes: number;
  nb_probables: number;
  nb_suspects: number;
  groupes: GroupeSimbox[];
}

const NIVEAU_CONFIG = {
  confirme: { label: 'Confirmé', bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-500' },
  probable: { label: 'Probable', bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-500' },
  suspect:  { label: 'Suspect',  bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400', dot: 'bg-yellow-500' },
};

const GroupeCard = ({ groupe, index }: { groupe: GroupeSimbox; index: number }) => {
  const [open, setOpen] = useState(false);
  const cfg = NIVEAU_CONFIG[groupe.niveau];

  return (
    <div className={cn('rounded-xl border p-4', cfg.bg, cfg.border)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
          <div>
            <p className="text-sm font-bold text-white">
              Simbox #{index + 1} — <span className={cfg.text}>{cfg.label}</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {groupe.nb_sims} MSISDN · Similarité {groupe.similarite_moyenne}% · Rotation {groupe.score_rotation}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={cn('text-xl font-black', cfg.text)}>{groupe.score_global}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Score</p>
          </div>
          <button onClick={() => setOpen(v => !v)} className="p-1 text-slate-400 hover:text-white">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          {/* Scores détaillés */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Similarité contacts</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${groupe.similarite_moyenne}%` }} />
                </div>
                <span className="text-xs font-bold text-blue-400">{groupe.similarite_moyenne}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">% de numéros appelés en commun</p>
            </div>
            <div className="bg-black/20 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Rotation temporelle</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${groupe.score_rotation}%` }} />
                </div>
                <span className="text-xs font-bold text-purple-400">{groupe.score_rotation}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">% de créneaux sans chevauchement</p>
            </div>
          </div>

          {/* Liste des MSISDN */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Users size={10} /> MSISDN du groupe
            </p>
            <div className="flex flex-wrap gap-1.5">
              {groupe.sims.map(sim => (
                <span key={sim} className="font-mono text-[10px] bg-white/10 text-slate-300 px-2 py-0.5 rounded border border-white/10">
                  {sim}
                </span>
              ))}
            </div>
          </div>

          {/* Contacts communs */}
          {groupe.contacts_communs.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                Numéros appelés en commun ({groupe.contacts_communs.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {groupe.contacts_communs.slice(0, 10).map(c => (
                  <span key={c} className="font-mono text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                    {c}
                  </span>
                ))}
                {groupe.contacts_communs.length > 10 && (
                  <span className="text-[10px] text-slate-500">+{groupe.contacts_communs.length - 10} autres</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SimboxDetection = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const operateur = user.operateur || 'TOUS';

  const [dateDeb, setDateDeb] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);

  const handleDetect = async () => {
    if (!dateDeb || !dateFin) return showError('Sélectionnez une période complète');
    if (dateDeb > dateFin) return showError('La date de début doit être avant la date de fin');

    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(apiUrl('/api/cdr/detecter-simbox'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operateur, date_debut: dateDeb, date_fin: dateFin, agent_id: user.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
      if (data.nb_groupes === 0) {
        showSuccess('Aucune simbox détectée sur cette période.');
      } else {
        showSuccess(`${data.nb_groupes} groupe(s) simbox détecté(s) — transmis à l'analyste`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur lors de la détection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Détection Simbox">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Explication */}
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3">
          <Info className="text-red-400 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-red-300 mb-1">Comment fonctionne la détection ?</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              L'algorithme compare les <strong className="text-slate-300">numéros appelés</strong> entre toutes les MSISDN.
              Si plusieurs MSISDN partagent les mêmes contacts ET <strong className="text-slate-300">ne sont jamais actives
              en même temps</strong> (rotation), elles appartiennent probablement au même boîtier simbox.
            </p>
          </div>
        </div>

        {/* Formulaire */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <ScanSearch size={16} className="text-red-400" />
              Sélectionner la période d'analyse
            </CardTitle>
            <CardDescription className="text-slate-400">
              Opérateur : <span className="font-bold text-white">{operateur}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Date de début</Label>
                <Input
                  type="date"
                  value={dateDeb}
                  onChange={e => { setDateDeb(e.target.value); setResult(null); }}
                  className="bg-white/5 border-white/20 text-white [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Date de fin</Label>
                <Input
                  type="date"
                  value={dateFin}
                  onChange={e => { setDateFin(e.target.value); setResult(null); }}
                  className="bg-white/5 border-white/20 text-white [color-scheme:dark]"
                />
              </div>
            </div>
            <Button
              onClick={handleDetect}
              disabled={!dateDeb || !dateFin || loading}
              className="w-full bg-red-600 hover:bg-red-700 h-12 font-bold"
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyse en cours...</>
                : <><ScanSearch className="mr-2 h-4 w-4" />Lancer la détection Simbox</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* Résumé des résultats */}
        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Groupes détectés', value: result.nb_groupes, color: 'text-white' },
                { label: 'MSISDN impliquées', value: result.nb_sims_impliquees, color: 'text-yellow-400' },
                { label: 'Confirmés', value: result.nb_confirmes, color: 'text-red-400' },
                { label: 'Probables', value: result.nb_probables, color: 'text-orange-400' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <p className={cn('text-2xl font-black', s.color)}>{s.value}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {result.nb_groupes === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                <p className="text-sm text-green-300">
                  Aucun groupe simbox détecté sur cette période. Le trafic semble normal.
                </p>
              </div>
            ) : (
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <BarChart3 size={16} className="text-red-400" />
                    Groupes simbox détectés
                  </CardTitle>
                  <CardDescription className="text-slate-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-yellow-400" />
                    Ces groupes ont été transmis à l'analyste pour validation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.groupes.map((g, i) => (
                    <GroupeCard key={g.id} groupe={g} index={i} />
                  ))}
                </CardContent>
              </Card>
            )}

            <Button
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10"
              onClick={() => { setResult(null); setDateDeb(''); setDateFin(''); }}
            >
              Nouvelle détection
            </Button>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SimboxDetection;
