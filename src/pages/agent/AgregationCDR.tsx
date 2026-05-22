import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Database, BarChart3, PlayCircle, CheckCircle2,
  ShieldAlert, TrendingUp, Loader2, AlertTriangle, Info,
  FileText, RefreshCw, CheckSquare, Square,
} from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { User } from '../../types';
import { apiFetch } from '../../lib/api';

interface CdrFile {
  id: string;
  nom_fichier: string;
  date_import: string;
  nb_lignes: number;
  statut: string;
  operateur: string;
  date_debut_donnees: string | null;
  date_fin_donnees: string | null;
}

interface AgregationResult {
  nb_sim_analysees: number;
  nb_lignes_traitees: number;
  nb_critiques: number;
  nb_elevees: number;
  nb_normales: number;
}

const AgregationCDR = () => {
  const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}') as User;
  const operateur = user.operateur || 'TOUS';

  const [fichiers, setFichiers] = useState<CdrFile[]>([]);
  const [loadingFichiers, setLoadingFichiers] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgregationResult | null>(null);

  const loadFichiers = async () => {
    setLoadingFichiers(true);
    try {
      const r = await apiFetch(`/api/cdr/fichiers-en-attente?operateur=${operateur}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setFichiers(data);
      setSelected(new Set());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur chargement des fichiers');
    } finally {
      setLoadingFichiers(false);
    }
  };

  useEffect(() => { loadFichiers(); }, []);

  const toggleFile = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === fichiers.length) setSelected(new Set());
    else setSelected(new Set(fichiers.map(f => f.id)));
  };

  const totalLignes = fichiers
    .filter(f => selected.has(f.id))
    .reduce((sum, f) => sum + f.nb_lignes, 0);

  const handleAgreger = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await apiFetch('/api/cdr/agreger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operateur,
          cdr_file_ids: Array.from(selected),
          agent_id: user.id,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
      setFichiers(prev => prev.filter(f => !selected.has(f.id)));
      setSelected(new Set());
      showSuccess(`Agrégation terminée — ${data.nb_sim_analysees} MSISDN analysées`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Erreur lors de l'agrégation");
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <DashboardLayout title="Agréger les données CDR">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Explication */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex gap-3">
          <Info className="text-blue-400 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-blue-300 mb-1">Pourquoi agréger ?</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Chaque import CDR est analysé séparément. Une MSISDN qui fait peu d'appels suspects
              sur chaque fichier peut passer inaperçue. L'agrégation <strong className="text-slate-300">regroupe
              les lignes des fichiers sélectionnés</strong> et analyse chaque MSISDN sur l'ensemble
              des données cumulées — ce qui permet de détecter des comportements frauduleux progressifs.
            </p>
          </div>
        </div>

        {/* Sélection des fichiers */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Database size={16} className="text-blue-400" />
                  Fichiers CDR en attente d'agrégation
                </CardTitle>
                <CardDescription className="text-slate-400 mt-1">
                  Opérateur : <span className="font-bold text-white">{operateur}</span>
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadFichiers}
                disabled={loadingFichiers}
                className="text-slate-400 hover:text-white"
              >
                <RefreshCw size={14} className={loadingFichiers ? 'animate-spin' : ''} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingFichiers ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-blue-400" size={24} />
              </div>
            ) : fichiers.length === 0 ? (
              <div className="text-center py-10">
                <BarChart3 size={32} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Aucun fichier CDR en attente.</p>
                <p className="text-slate-500 text-xs mt-1">Importez d'abord des fichiers CDR depuis "Importer CDR".</p>
              </div>
            ) : (
              <>
                {/* Tout sélectionner */}
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-1"
                >
                  {selected.size === fichiers.length
                    ? <CheckSquare size={14} className="text-blue-400" />
                    : <Square size={14} />
                  }
                  {selected.size === fichiers.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  <span className="text-slate-600">({fichiers.length} fichier{fichiers.length > 1 ? 's' : ''})</span>
                </button>

                {/* Liste des fichiers */}
                <div className="space-y-2">
                  {fichiers.map(f => {
                    const isSelected = selected.has(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleFile(f.id)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-blue-500/15 border-blue-500/40'
                            : 'bg-white/3 border-white/10 hover:bg-white/5'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isSelected
                            ? <CheckSquare size={16} className="text-blue-400" />
                            : <Square size={16} className="text-slate-500" />
                          }
                        </div>
                        <FileText size={16} className={`shrink-0 mt-0.5 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {f.nom_fichier}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            <span className="text-[10px] text-slate-500">
                              Importé le {fmtDate(f.date_import)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {f.nb_lignes.toLocaleString('fr-FR')} lignes
                            </span>
                            {f.date_debut_donnees && (
                              <span className="text-[10px] text-slate-500">
                                Données : {fmtDate(f.date_debut_donnees)} → {fmtDate(f.date_fin_donnees)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isSelected
                              ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                              : 'bg-white/5 border-white/10 text-slate-500'
                          }`}>
                            {f.nb_lignes.toLocaleString('fr-FR')} lignes
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Résumé sélection + bouton */}
                {selected.size > 0 && (
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-blue-300">
                          {selected.size} fichier{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {totalLignes.toLocaleString('fr-FR')} lignes à agréger
                        </p>
                      </div>
                      <BarChart3 size={18} className="text-blue-400" />
                    </div>

                    <Button
                      onClick={handleAgreger}
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-sm font-bold"
                    >
                      {loading
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Agrégation en cours...</>
                        : <><PlayCircle className="mr-2 h-4 w-4" />Agréger la sélection</>
                      }
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Résultats */}
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
                  <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">Critiques</p>
                </div>
                <div className="bg-orange-500/10 rounded-xl p-5 text-center border border-orange-500/20">
                  <AlertTriangle className="text-orange-400 mx-auto mb-2" size={22} />
                  <p className="text-3xl font-black text-orange-400">{result.nb_elevees}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">Élevées</p>
                </div>
                <div className="bg-green-500/10 rounded-xl p-5 text-center border border-green-500/20">
                  <TrendingUp className="text-green-400 mx-auto mb-2" size={22} />
                  <p className="text-3xl font-black text-green-400">{result.nb_normales}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">Normales</p>
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
                onClick={() => setResult(null)}
              >
                Fermer
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AgregationCDR;
