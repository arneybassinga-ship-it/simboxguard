import React, { useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileUp, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { User } from '../../types';

const ImportCDR = () => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
      } else {
        showError('Format de fichier non supporté. Utilisez CSV ou Excel.');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!user?.id) {
      showError('Utilisateur non authentifié.');
      return;
    }

    setUploading(true);
    setProgress(0);

    const data = new FormData();
    data.append('file', file);
    data.append('agent_id', user.id);
    if (user.operateur) data.append('operateur', user.operateur);

    try {
      const response = await fetch('http://localhost:4000/api/cdr/upload', {
        method: 'POST',
        body: data,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Erreur API');
      }

      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 20;
        });
      }, 100);

      setTimeout(() => {
        setUploading(false);
        setFile(null);
        setProgress(0);
        showSuccess(`Importation réussie : ${result.nb_lignes} lignes, ${result.analyses.length} analyses générées`);
      }, 700);
    } catch (err) {
      console.error(err);
      showError(`Échec de l'importation : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <DashboardLayout title="Importer un fichier CDR">
      <div className="max-w-2xl mx-auto">
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle>Sélectionner un fichier</CardTitle>
            <CardDescription>
              Importez vos fichiers CDR au format CSV ou Excel.
              Colonnes requises : numero_sim, numero_appelé, date_heure, durée_secondes, statut_appel, origine.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12">
            {!file ? (
              <div className="text-center">
                <div className="bg-blue-50 p-6 rounded-full inline-block mb-4">
                  <FileUp className="w-12 h-12 text-blue-600" />
                </div>
                <p className="text-slate-600 mb-4">Glissez-déposez votre fichier ici ou</p>
                <label className="cursor-pointer">
                  <span className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    Parcourir les fichiers
                  </span>
                  <input type="file" className="hidden" onChange={handleFileChange} accept=".csv,.xlsx,.xls" />
                </label>
              </div>
            ) : (
              <div className="w-full">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border mb-6">
                  <FileUp className="text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={uploading}>
                    Supprimer
                  </Button>
                </div>

                {uploading && (
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Analyse en cours...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                )}

                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleUpload} disabled={uploading}>
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Traitement...
                    </>
                  ) : (
                    'Lancer l\'importation'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-100 flex gap-3">
            <CheckCircle2 className="text-green-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-green-800">Validation automatique</p>
              <p className="text-xs text-green-700">Le système vérifie la structure du fichier avant l'importation.</p>
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex gap-3">
            <AlertCircle className="text-blue-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-blue-800">Analyse immédiate</p>
              <p className="text-xs text-blue-700">L'algorithme de détection s'exécute dès la fin de l'importation.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ImportCDR;
