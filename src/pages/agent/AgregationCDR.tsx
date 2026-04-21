import { useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Database, BarChart3, PlayCircle, CheckCircle2,
  ShieldAlert, TrendingUp, Loader2, AlertTriangle, Info,
} from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { User } from '../../types';
import { apiUrl } from '../../lib/api';

interface PreviewData {
  nb_fichiers: number;
  nb_lignes: number;
  nb_sim_uniques: number;
}

interface AgregationResult {
  nb_sim_analysees: number;
  nb_lignes_traitees: number;
  nb_critiques: number;
  nb_elevees: number;
  nb_normales: number;
}

const AgregationCDR = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const operateur = user.operateur || 'TOUS';

  const [dateDeb, setDateDeb] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<AgregationResult | null>(null);

  const resetPreview = () => { setPreview(null); setResult(null); };

  const handlePreview = async () => {
    if (!dateDeb || !dateFin) return showError('Sélectionnez une période complète');
    if (dateDeb > dateFin) return showError('La date de début doit être avant la date de fin');

    setPreviewing(true);
    setResult(null);
    try {
      const r = await fetch(
        `${apiUrl('/api/cdr/preview-agregation')}?operateur=${operateur}&date_debut=${dateDeb}&date_fin=${dateFin}`
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setPreview(data);
      if (data.nb_lignes === 0) showError('Aucune donnée CDR importée sur cette période');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur lors de la prévisualisation');
    } finally {
      setPreviewing(false);
    }
  };

  const handleAgreger = async () => {
    if (!preview || preview.nb_lignes === 0) return;

    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(apiUrl('/api/cdr/agreger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operateur,
          date_debut: dateDeb,
          date_fin: dateFin,
          agent_id: user.id,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
      setPreview(null);
      showSuccess(`Agrégation terminée — ${data.nb_sim_analysees} MSISDN analysées`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Erreur lors de l'agrégation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Agréger les données CDR">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Explication du concept */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex gap-3">
          <Info className="text-blue-400 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-blue-300 mb-1">Pourquoi agréger ?</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Chaque import CDR est analysé séparément. Une MSISDN qui fait peu d'appels suspects
              sur chaque fichier peut passer inaperçue. L'agrégation <strong className="text-slate-300">regroupe
              toutes les lignes de la période choisie</strong> et analyse chaque MSISDN sur l'ensemble
              des données cumulées — ce qui permet de détecter des comportements frauduleux
              progressifs.
            </p>
          </div>
        </div>

        {/* Formulaire période */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Database size={16} className="text-blue-400" />
              Sélectionner la période d'analyse
            </CardTitle>
            <CardDescription className="text-slate-400">
              Opérateur : <span className="font-bold text-white">{operateur}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                  Date de début
                </Label>
                <Input
                  type="date"
                  value={dateDeb}
                  onChange={e => { setDateDeb(e.target.value); resetPreview(); }}
                  className="bg-white/5 border-white/20 text-white [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                  Date de fin
                </Label>
                <Input
                  type="date"
                  value={dateFin}
                  onChange={e => { setDateFin(e.target.value); resetPreview(); }}
                  className="bg-white/5 border-white/20 text-white [color-scheme:dark]"
                />
              </div>
            </div>

            <Button
              onClick={handlePreview}
              disabled={!dateDeb || !dateFin || previewing}
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10"
            >
              {previewing
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification...</>
                : <><BarChart3 className="mr-2 h-4 w-4" />Prévisualiser les données disponibles</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* Aperçu avant agrégation */}
        {preview && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-400" />
                Aperçu — données disponibles sur la période
              </CardTitle>
              <CardDescription className="text-slate-400">
                Du <span className="text-white font-medium">{dateDeb}</span> au{' '}
                <span className="text-white font-medium">{dateFin}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-500/10 rounded-xl p-4 text-center border border-blue-500/20">
                  <p className="text-2xl font-black text-blue-400">{preview.nb_fichiers}</p>
                  <p className="text-xs text-slate-400 mt-1">Fichiers CDR</p>
                </div>
                <div className="bg-purple-500/10 rounded-xl p-4 text-center border border-purple-500/20">
                  <p className="text-2xl font-black text-purple-400">
                    {preview.nb_lignes.toLocaleString('fr-FR')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Lignes CDR cumulées</p>
                </div>
                <div className="bg-yellow-500/10 rounded-xl p-4 text-center border border-yellow-500/20">
                  <p className="text-2xl font-black text-yellow-400">
                    {preview.nb_sim_uniques.toLocaleString('fr-FR')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">MSISDN uniques</p>
                </div>
              </div>

              {preview.nb_lignes > 0 ? (
                <Button
                  onClick={handleAgreger}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-sm font-bold"
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Agrégation en cours...</>
                    : <><PlayCircle className="mr-2 h-4 w-4" />Lancer l'agrégation</>
                  }
                </Button>
              ) : (
                <p className="text-center text-sm text-slate-500">
                  Aucune donnée disponible sur cette période. Importez d'abord des fichiers CDR.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Résultats de l'agrégation */}
        {result && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-400" />
                Agrégation terminée
              </CardTitle>
              <CardDescription className="text-slate-400">
                <span className="text-white font-medium">
                  {result.nb_lignes_traitees.toLocaleString('fr-FR')} lignes
                </span>{' '}
                analysées sur{' '}
                <span className="text-white font-medium">
                  {result.nb_sim_analysees} MSISDN uniques
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-red-500/10 rounded-xl p-5 text-center border border-red-500/20">
                  <ShieldAlert className="text-red-400 mx-auto mb-2" size={22} />
                  <p className="text-3xl font-black text-red-400">{result.nb_critiques}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">
                    Critiques
                  </p>
                </div>
                <div className="bg-orange-500/10 rounded-xl p-5 text-center border border-orange-500/20">
                  <AlertTriangle className="text-orange-400 mx-auto mb-2" size={22} />
                  <p className="text-3xl font-black text-orange-400">{result.nb_elevees}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">
                    Élevées
                  </p>
                </div>
                <div className="bg-green-500/10 rounded-xl p-5 text-center border border-green-500/20">
                  <TrendingUp className="text-green-400 mx-auto mb-2" size={22} />
                  <p className="text-3xl font-black text-green-400">{result.nb_normales}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">
                    Normales
                  </p>
                </div>
              </div>

              {(result.nb_critiques > 0 || result.nb_elevees > 0) && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex gap-2 items-start">
                  <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300">
                    <strong>{result.nb_critiques + result.nb_elevees} MSISDN suspecte(s)</strong> transmises
                    à l'analyste pour validation. Consultez "Mes Analyses" pour suivre l'évolution.
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
                onClick={() => { setResult(null); setDateDeb(''); setDateFin(''); }}
              >
                Nouvelle agrégation
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AgregationCDR;
