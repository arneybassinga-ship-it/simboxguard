import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays } from 'lucide-react';

interface DateRangePickerProps {
  dateDebut: string;
  dateFin: string;
  onChangeDebut: (v: string) => void;
  onChangeFin: (v: string) => void;
  onReset?: () => void;
  accentColor?: string; // classe Tailwind ex: 'blue' | 'red' | 'yellow'
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

const SHORTCUTS = [
  {
    label: "Aujourd'hui",
    get: () => { const t = fmt(new Date()); return [t, t]; },
  },
  {
    label: '7 derniers jours',
    get: () => {
      const fin = new Date();
      const deb = new Date(); deb.setDate(deb.getDate() - 6);
      return [fmt(deb), fmt(fin)];
    },
  },
  {
    label: 'Ce mois',
    get: () => {
      const now = new Date();
      const deb = new Date(now.getFullYear(), now.getMonth(), 1);
      return [fmt(deb), fmt(now)];
    },
  },
  {
    label: 'Mois préc.',
    get: () => {
      const now = new Date();
      const deb = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const fin = new Date(now.getFullYear(), now.getMonth(), 0);
      return [fmt(deb), fmt(fin)];
    },
  },
  {
    label: '3 derniers mois',
    get: () => {
      const fin = new Date();
      const deb = new Date(fin.getFullYear(), fin.getMonth() - 2, 1);
      return [fmt(deb), fmt(fin)];
    },
  },
  {
    label: '6 derniers mois',
    get: () => {
      const fin = new Date();
      const deb = new Date(fin.getFullYear(), fin.getMonth() - 5, 1);
      return [fmt(deb), fmt(fin)];
    },
  },
];

const isActive = (deb: string, fin: string, shortcut: typeof SHORTCUTS[0]) => {
  const [sd, sf] = shortcut.get();
  return deb === sd && fin === sf;
};

export const DateRangePicker = ({
  dateDebut,
  dateFin,
  onChangeDebut,
  onChangeFin,
  onReset,
  accentColor = 'blue',
}: DateRangePickerProps) => {

  const activeClass = {
    blue:   'bg-blue-500/20 text-blue-300 border-blue-500/40',
    red:    'bg-red-500/20 text-red-300 border-red-500/40',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  }[accentColor] ?? 'bg-blue-500/20 text-blue-300 border-blue-500/40';

  const apply = (s: typeof SHORTCUTS[0]) => {
    const [deb, fin] = s.get();
    onChangeDebut(deb);
    onChangeFin(fin);
    onReset?.();
  };

  const nbJours = dateDebut && dateFin
    ? Math.round((new Date(dateFin).getTime() - new Date(dateDebut).getTime()) / 86400000) + 1
    : null;

  return (
    <div className="space-y-3">
      {/* Raccourcis */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <CalendarDays size={13} className="text-slate-500 shrink-0" />
        {SHORTCUTS.map(s => (
          <button
            key={s.label}
            type="button"
            onClick={() => apply(s)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all',
              isActive(dateDebut, dateFin, s)
                ? activeClass
                : 'border-white/15 text-slate-400 hover:text-white hover:border-white/30'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Champs manuels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">
            Date de début
          </Label>
          <Input
            type="date"
            value={dateDebut}
            onChange={e => { onChangeDebut(e.target.value); onReset?.(); }}
            className="bg-white/5 border-white/20 text-white"
            style={{ colorScheme: 'dark' }}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">
            Date de fin
          </Label>
          <Input
            type="date"
            value={dateFin}
            onChange={e => { onChangeFin(e.target.value); onReset?.(); }}
            className="bg-white/5 border-white/20 text-white"
            style={{ colorScheme: 'dark' }}
          />
        </div>
      </div>

      {/* Résumé période */}
      {dateDebut && dateFin && nbJours !== null && nbJours > 0 && (
        <p className="text-[11px] text-slate-500">
          Période sélectionnée :{' '}
          <span className="text-slate-300 font-medium">
            {new Date(dateDebut).toLocaleDateString('fr-FR')}
          </span>
          {' → '}
          <span className="text-slate-300 font-medium">
            {new Date(dateFin).toLocaleDateString('fr-FR')}
          </span>
          {' '}
          <span className="text-slate-500">({nbJours} jour{nbJours > 1 ? 's' : ''})</span>
        </p>
      )}
    </div>
  );
};
