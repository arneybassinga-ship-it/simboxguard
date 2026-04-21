import { useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileUp, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, ArrowLeft, Eye, Table2,
} from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { User } from '../../types';
import { cn } from '@/lib/utils';
import { apiUrl } from '../../lib/api';

interface DetectResult {
  mapping: Record<string, string>;
  preview: Record<string, unknown>[];
  colonnes: string[];
}

interface UploadResult {
  nb_lignes: number;
  nb_lignes_rejetees: number;
}

const CHAMPS_SYSTEME: { key: string; label: string; required: boolean }[] = [
  { key: 'numero_sim',      label: 'MSISDN',                     required: true  },
  { key: 'numero_appele',   label: 'Numéro appelé',              required: true  },
  { key: 'date_heure',      label: 'Date et heure',              required: true  },
  { key: 'duree_secondes',  label: 'Durée (secondes)',           required: true  },
  { key: 'statut_appel',    label: 'Statut appel',               required: false },
  { key: 'origine',         label: "Origine (local / international)", required: false },
];

const NONE_VALUE = '__none__';

const ImportCDR = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;

  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [file, setFile]         = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [mapping, setMapping]   = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [result, setResult]     = useState<UploadResult | null>(null);

  // ── Step 1 : file pick ──────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.match(/\.(csv|xlsx|xls)$/i)) {
      showError('Format non supporté. Utilisez CSV ou Excel (.csv / .xlsx / .xls).');
      return;
    }
    setFile(f);
    setDetected(null);
    setResult(null);
    setStep(1);
  };

  const handleDetect = async () => {
    if (!file) return;
    setDetecting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(apiUrl('/api/cdr/detect-columns'), { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur détection colonnes');
      setDetected(data);
      setMapping(data.mapping ?? {});
      setStep(2);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur lors de la détection des colonnes');
    } finally {
      setDetecting(false);
    }
  };

  // ── Step 2 : confirm mapping ────────────────────────────────────────────────
  const updateMapping = (systemKey: string, colonne: string) => {
    setMapping(prev => ({ ...prev, [systemKey]: colonne === NONE_VALUE ? '' : colonne }));
  };

  const mappingValid = CHAMPS_SYSTEME
    .filter(c => c.required)
    .every(c => !!mapping[c.key]);

  // ── Step 2 → 3 : upload ─────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !user?.id) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('agent_id', user.id);
    if (user.operateur) fd.append('operateur', user.operateur);
    fd.append('mapping', JSON.stringify(mapping));
    try {
      const r = await fetch(apiUrl('/api/cdr/upload'), { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur importation');
      setResult(data);
      setStep(3);
      const rejet = data.nb_lignes_rejetees > 0 ? ` (${data.nb_lignes_rejetees} rejetées)` : '';
      showSuccess(`${data.nb_lignes} lignes importées${rejet}.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur importation');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null); setDetected(null); setMapping({});
    setResult(null); setStep(1);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Importer un fichier CDR">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-2">
          {[
            { n: 1, label: 'Fichier' },
            { n: 2, label: 'Colonnes' },
            { n: 3, label: 'Résultat' },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-slate-600" />}
              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold',
                step === n
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : step > n
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-500'
              )}>
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black',
                  step === n ? 'bg-blue-600 text-white' : step > n ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'
                )}>{step > n ? '✓' : n}</span>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* ═══ STEP 1 ════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <>
            <Card className="bg-white/5 border-white/10 border-dashed">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <FileUp size={16} className="text-blue-400" />
                  Sélectionner un fichier CDR
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Formats acceptés : CSV, Excel (.xlsx / .xls) — toute structure de colonnes
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-10">
                {!file ? (
                  <div className="text-center">
                    <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-2xl inline-block mb-4">
                      <FileUp className="w-12 h-12 text-blue-400" />
                    </div>
                    <p className="text-slate-400 mb-4 text-sm">Glissez-déposez votre fichier ici ou</p>
                    <label className="cursor-pointer">
                      <span className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors">
                        Parcourir les fichiers
                      </span>
                      <input type="file" className="hidden" onChange={handleFileChange} accept=".csv,.xlsx,.xls" />
                    </label>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <FileUp size={18} className="text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white font-mono">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} Ko</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setFile(null)}
                        className="text-slate-400 hover:text-red-400 text-xs">
                        Changer
                      </Button>
                    </div>
                    <Button onClick={handleDetect} disabled={detecting}
                      className="w-full bg-blue-600 hover:bg-blue-700 h-11 font-bold">
                      {detecting
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyse des colonnes...</>
                        : <><Eye className="mr-2 h-4 w-4" />Analyser les colonnes</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex gap-3">
                <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-sm font-bold text-blue-300">Détection automatique</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Le système reconnaît automatiquement vos colonnes (MSISDN, calling_number, etc.)
                    quelle que soit la structure de votre fichier.
                  </p>
                </div>
              </div>
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex gap-3">
                <AlertCircle className="text-slate-400 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-sm font-bold text-slate-300">Étape suivante</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Après l'import, allez dans <strong className="text-white">Agréger CDR</strong> pour
                    lancer l'analyse sur une période.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ STEP 2 ════════════════════════════════════════════════════════ */}
        {step === 2 && detected && (
          <>
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Table2 size={16} className="text-yellow-400" />
                  Correspondance des colonnes
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Vérifiez que chaque champ système correspond à la bonne colonne de votre fichier.
                  Les correspondances ont été détectées automatiquement.
                  Seuls le MSISDN, le numéro appelé, la date/heure et la durée sont indispensables.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {CHAMPS_SYSTEME.map(champ => (
                  <div key={champ.key} className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <p className="text-xs font-bold text-slate-300">
                        {champ.label}
                        {champ.required && <span className="text-red-400 ml-1">*</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{champ.key}</p>
                    </div>
                    <select
                      value={mapping[champ.key] || NONE_VALUE}
                      onChange={e => updateMapping(champ.key, e.target.value)}
                      className={cn(
                        'w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500',
                        mapping[champ.key]
                          ? 'border-green-500/40 bg-green-500/5'
                          : champ.required
                          ? 'border-red-500/40 bg-red-500/5'
                          : 'border-white/20'
                      )}
                    >
                      {!champ.required && (
                        <option value={NONE_VALUE} className="bg-slate-900">— Non mappé —</option>
                      )}
                      {champ.required && !mapping[champ.key] && (
                        <option value={NONE_VALUE} className="bg-slate-900">Sélectionner...</option>
                      )}
                      {detected.colonnes.map(col => (
                        <option key={col} value={col} className="bg-slate-900">{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Aperçu */}
            {detected.preview.length > 0 && (
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Eye size={14} className="text-slate-400" />
                    Aperçu — 3 premières lignes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr>
                          {detected.colonnes.map(col => (
                            <th key={col} className="text-left px-2 py-1.5 text-slate-400 border-b border-white/10 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detected.preview.map((row, i) => (
                          <tr key={i} className="border-b border-white/5">
                            {detected.colonnes.map(col => (
                              <td key={col} className="px-2 py-1.5 text-slate-300 whitespace-nowrap max-w-[120px] truncate">
                                {String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}
                className="border-white/20 text-white hover:bg-white/10 gap-2">
                <ArrowLeft size={14} /> Retour
              </Button>
              <Button onClick={handleUpload} disabled={!mappingValid || uploading}
                className="flex-1 bg-green-600 hover:bg-green-700 h-11 font-bold">
                {uploading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importation...</>
                  : <><FileUp className="mr-2 h-4 w-4" />Confirmer et importer</>}
              </Button>
            </div>

            {!mappingValid && (
              <p className="text-xs text-red-400 text-center">
                Veuillez associer toutes les colonnes obligatoires (*) avant de continuer.
              </p>
            )}
          </>
        )}

        {/* ═══ STEP 3 ════════════════════════════════════════════════════════ */}
        {step === 3 && result && (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <div>
                <p className="text-xl font-black text-white">Importation réussie</p>
                <p className="text-slate-400 text-sm mt-1">
                  <span className="text-green-400 font-bold">{result.nb_lignes.toLocaleString()}</span> lignes importées
                  {result.nb_lignes_rejetees > 0 && (
                    <span className="text-orange-400"> · {result.nb_lignes_rejetees} rejetées (format invalide)</span>
                  )}
                </p>
              </div>
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-left max-w-sm mx-auto">
                <p className="text-sm font-bold text-blue-300 mb-1">Prochaine étape</p>
                <p className="text-xs text-slate-400">
                  Rendez-vous dans <strong className="text-white">Agréger CDR</strong> pour combiner
                  plusieurs imports et lancer l'analyse sur une période.
                </p>
              </div>
              <Button onClick={reset} className="bg-blue-600 hover:bg-blue-700 mt-2">
                Importer un autre fichier
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
};

export default ImportCDR;
