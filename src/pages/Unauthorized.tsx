import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-red-50 rounded-full">
            <ShieldAlert className="w-12 h-12 text-red-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Accès Non Autorisé</h1>
        <p className="text-slate-600 mb-8">
          Vous n'avez pas les permissions nécessaires pour accéder à cette page. 
          Veuillez contacter votre administrateur si vous pensez qu'il s'agit d'une erreur.
        </p>
        <Button 
          onClick={() => navigate('/')}
          className="w-full bg-slate-900 hover:bg-slate-800"
        >
          Retour à la connexion
        </Button>
      </div>
    </div>
  );
};

export default Unauthorized;