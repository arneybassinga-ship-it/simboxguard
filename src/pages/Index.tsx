import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Mail, Lock, KeyRound, ArrowRight } from 'lucide-react';
import { MOCK_USERS } from '../store/mockData';
import { showSuccess, showError } from '../utils/toast';

const Index = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'login' | 'otp'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const user = MOCK_USERS.find(u => u.email === email);
    
    setTimeout(() => {
      if (user) {
        setStep('otp');
        showSuccess("Code OTP envoyé (Simulé: 123456)");
      } else {
        showError("Identifiants incorrects");
      }
      setLoading(false);
    }, 1000);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      if (otp === '123456') {
        const user = MOCK_USERS.find(u => u.email === email);
        if (user) {
          localStorage.setItem('currentUser', JSON.stringify(user));
          showSuccess(`Bienvenue, ${user.nom}`);
          if (user.role.startsWith('AGENT')) navigate('/agent/dashboard');
          else if (user.role === 'ANALYSTE') navigate('/analyste/dashboard');
          else navigate('/arpce/dashboard');
        }
      } else {
        showError("Code OTP invalide");
      }
      setLoading(false);
    }, 1000);
  };

  // Style d'input ultra-précis pour contrer les styles par défaut du navigateur
  const inputStyle = {
    WebkitTextFillColor: 'white',
    WebkitBoxShadow: '0 0 0px 1000px transparent inset',
    transition: 'background-color 5000s ease-in-out 0s',
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] overflow-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />

      <div className="container max-w-5xl h-[650px] flex items-center justify-center p-4 z-10">
        <div className="w-full h-full flex flex-col md:flex-row bg-[#0f172a]/40 backdrop-blur-3xl border border-white/10 rounded-[48px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          
          {/* Left Side - Form */}
          <div className="flex-1 p-16 flex flex-col justify-center">
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-500/30">
                  <ShieldAlert className="text-blue-400 w-6 h-6" />
                </div>
                <span className="text-blue-400 font-bold tracking-[0.3em] text-xs uppercase">SIMVigil</span>
              </div>
              <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
                {step === 'login' ? 'Ravi de vous revoir' : 'Vérification'}
              </h1>
              <p className="text-slate-400 text-sm font-medium">
                {step === 'login' 
                  ? "Veuillez entrer vos identifiants pour continuer." 
                  : "Un code de sécurité a été envoyé à votre adresse."}
              </p>
            </div>

            {step === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-10">
                <div className="space-y-8">
                  <div className="relative group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1 mb-2 block">Email Professionnel</label>
                    <div className="flex items-center border-b border-slate-800 group-focus-within:border-blue-500 transition-all duration-500 py-2">
                      <input 
                        type="email" 
                        style={inputStyle}
                        className="bg-transparent border-none outline-none text-white w-full px-1 py-1 text-base placeholder:text-slate-700 appearance-none"
                        placeholder="nom@operateur.cg"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="off"
                      />
                      <Mail className="text-slate-600 group-focus-within:text-blue-400 w-5 h-5 transition-colors" />
                    </div>
                  </div>

                  <div className="relative group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1 mb-2 block">Mot de passe</label>
                    <div className="flex items-center border-b border-slate-800 group-focus-within:border-blue-500 transition-all duration-500 py-2">
                      <input 
                        type="password" 
                        style={inputStyle}
                        className="bg-transparent border-none outline-none text-white w-full px-1 py-1 text-base placeholder:text-slate-700 appearance-none"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <Lock className="text-slate-600 group-focus-within:text-blue-400 w-5 h-5 transition-colors" />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 mt-6 group"
                >
                  {loading ? "Authentification..." : "Se connecter"}
                  {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-10">
                <div className="relative group">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1 mb-2 block">Code de sécurité (OTP)</label>
                  <div className="flex items-center border-b border-slate-800 group-focus-within:border-blue-500 transition-all duration-500 py-2">
                    <input 
                      type="text" 
                      style={inputStyle}
                      className="bg-transparent border-none outline-none text-white w-full px-1 py-2 text-center tracking-[1.2em] font-bold text-2xl placeholder:text-slate-800 appearance-none"
                      placeholder="000000"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                    />
                    <KeyRound className="text-slate-600 group-focus-within:text-blue-400 w-5 h-5 transition-colors" />
                  </div>
                </div>

                <div className="space-y-4">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98]"
                  >
                    {loading ? "Vérification..." : "Confirmer le code"}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setStep('login')}
                    className="w-full py-2 text-slate-500 hover:text-blue-400 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Retour
                  </button>
                </div>
              </form>
            )}

            <div className="mt-auto pt-12 text-center">
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.3em]">
                Système de Régulation ARPCE • Congo
              </p>
            </div>
          </div>

          {/* Right Side - Visual */}
          <div className="hidden md:flex flex-1 p-8">
            <div className="w-full h-full bg-gradient-to-br from-slate-900 to-[#020617] rounded-[40px] relative overflow-hidden flex items-center justify-center border border-white/5 shadow-inner">
              {/* Glow */}
              <div className="absolute w-80 h-80 bg-blue-500/10 rounded-full blur-[100px]" />
              
              <div className="relative z-10 flex flex-col items-center text-center p-12">
                <div className="relative mb-10">
                  <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full" />
                  <div className="w-40 h-40 bg-[#0f172a] rounded-full flex items-center justify-center border border-white/10 relative z-10">
                    <ShieldAlert className="w-20 h-20 text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">SIMVigil — Détection Fraude Télécom</h2>
                <p className="text-slate-500 text-sm max-w-[300px] leading-relaxed font-medium">
                  Détection avancée des fraudes télécoms par analyse comportementale des flux CDR en temps réel.
                </p>
              </div>

              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                <div className="absolute top-10 left-10 w-1 h-1 bg-white rounded-full" />
                <div className="absolute top-20 right-20 w-1 h-1 bg-blue-400 rounded-full" />
                <div className="absolute bottom-40 left-20 w-1 h-1 bg-indigo-400 rounded-full" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Index;