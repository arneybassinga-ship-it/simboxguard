import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import {
  LayoutDashboard, FileUp, ShieldAlert, FileText,
  LogOut, Bell, User as UserIcon, Activity, Ban, ChevronRight, Database, ScanSearch
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, title }) => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}') as User;

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  const isAirtel = user.role === 'AGENT_AIRTEL';

  const theme = isAirtel ? {
    sidebarBg: "bg-[#0f172a]/40",
    sidebarBorder: "border-red-500/20",
    primary: "text-red-400",
    accent: "bg-red-400/20 border-red-400/30",
    glow1: "bg-red-600/20",
    glow2: "bg-red-900/20",
    navActive: "bg-red-400/20 text-red-400 border-red-400/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]",
    badge: "bg-red-500/10 text-red-300 border-red-500/20",
    headerBorder: "border-red-500/20",
    iconColor: "text-red-400",
    pulse: "bg-red-400",
  } : {
    sidebarBg: "bg-[#0f172a]/40",
    sidebarBorder: "border-blue-500/20",
    primary: "text-yellow-400",
    accent: "bg-yellow-400/20 border-yellow-400/30",
    glow1: "bg-blue-600/20",
    glow2: "bg-indigo-600/20",
    navActive: "bg-yellow-400/20 text-yellow-400 border-yellow-400/30 shadow-[0_0_20px_rgba(250,204,21,0.2)]",
    badge: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    headerBorder: "border-blue-500/20",
    iconColor: "text-blue-400",
    pulse: "bg-yellow-400",
  };

  const menuItems = {
    AGENT_MTN: [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/agent/dashboard' },
      { icon: FileUp, label: 'Importer CDR', path: '/agent/import' },
      { icon: Database, label: 'Agréger CDR', path: '/agent/agregation' },
      { icon: ScanSearch, label: 'Détecter Simbox', path: '/agent/simbox' },
      { icon: FileText, label: 'Mes Analyses', path: '/agent/analyses' },
      { icon: Ban, label: 'Ordres de Blocage', path: '/agent/blocking' },
    ],
    AGENT_AIRTEL: [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/agent/dashboard' },
      { icon: FileUp, label: 'Importer CDR', path: '/agent/import' },
      { icon: Database, label: 'Agréger CDR', path: '/agent/agregation' },
      { icon: ScanSearch, label: 'Détecter Simbox', path: '/agent/simbox' },
      { icon: FileText, label: 'Mes Analyses', path: '/agent/analyses' },
      { icon: Ban, label: 'Ordres de Blocage', path: '/agent/blocking' },
    ],
    ANALYSTE: [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/analyste/dashboard' },
      { icon: ShieldAlert, label: 'MSISDN suspectes', path: '/analyste/suspicious' },
      { icon: ScanSearch, label: 'Simbox Détectées', path: '/analyste/simbox' },
      { icon: FileText, label: 'Rapports Analyste', path: '/analyste/reports' },
      { icon: Activity, label: 'Historique', path: '/analyste/history' },
    ],
    ARPCE: [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/arpce/dashboard' },
      { icon: FileText, label: 'Rapports Opérateurs', path: '/arpce/reports' },
      { icon: Ban, label: 'Suivi Blocages', path: '/arpce/blocking' },
      { icon: Bell, label: 'Sanctions', path: '/arpce/sanctions' },
    ],
  };

  const currentMenu = menuItems[user.role as keyof typeof menuItems] || [];

  return (
    <div
      className="bg-[#020617] text-white font-sans"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Background Glows */}
      <div className={cn("absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full blur-[150px] pointer-events-none opacity-60", theme.glow1)} />
      <div className={cn("absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full blur-[150px] pointer-events-none opacity-40", theme.glow2)} />

      {/* ===== SIDEBAR FIXE ===== */}
      <aside
        className={cn(
          "backdrop-blur-3xl border-r flex flex-col z-20 shadow-[25px_0_60px_rgba(0,0,0,0.5)]",
          theme.sidebarBg,
          theme.sidebarBorder
        )}
        style={{
          width: '288px',
          minWidth: '288px',
          maxWidth: '288px',
          flexShrink: 0,
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Logo */}
        <div className="p-8 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className={cn("p-2 rounded-xl border shadow-lg", theme.accent)}>
              <ShieldAlert className={cn("w-5 h-5", theme.primary)} />
            </div>
            <h1 className="text-lg font-bold tracking-tight">SIMVigil</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Régulation ARPCE</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-3">
          {currentMenu.map((item) => {
            const isActive = window.location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden",
                  isActive
                    ? theme.navActive
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3 relative z-10">
                  <item.icon size={18} className={cn("transition-colors duration-500", isActive ? theme.primary : "group-hover:text-white")} />
                  <span className="text-sm font-bold tracking-wide">{item.label}</span>
                </div>
                {isActive && <ChevronRight size={14} className={theme.primary} />}
              </button>
            );
          })}
        </nav>

        {/* Profil + Déconnexion */}
        <div className="p-6 mt-auto">
          <div className="bg-black/20 rounded-[32px] p-6 border border-white/10 mb-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-4 mb-5">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 flex-shrink-0",
                "bg-blue-600"
              )}>
                <UserIcon size={20} className="text-white" />
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="text-sm font-black truncate text-white">{user.nom}</p>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                  {user.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl h-11 text-xs font-black uppercase tracking-widest"
              onClick={handleLogout}
            >
              <LogOut size={14} className="mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </aside>

      {/* ===== CONTENU PRINCIPAL ===== */}
      <main
        className="relative z-10"
        style={{
          flex: 1,
          minWidth: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header fixe */}
        <header
          className={cn("bg-transparent px-10 flex items-center justify-between border-b", theme.headerBorder)}
          style={{
            height: '96px',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">{title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                theme.pulse
              )} />
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {user.operateur && (
              <div className={cn(
                "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border shadow-2xl",
                theme.badge
              )}>
                Réseau {user.operateur}
              </div>
            )}
            <button className="relative p-3 bg-white/5 rounded-2xl border border-white/10 text-slate-400 hover:text-white transition-all hover:scale-110 shadow-xl">
              <Bell size={22} />
              <span className={cn(
                "absolute top-3 right-3 w-3 h-3 rounded-full border-2 border-[#020617]",
                theme.pulse
              )} />
            </button>
          </div>
        </header>

        {/* Zone scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '2.5rem',
          }}
        >
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
