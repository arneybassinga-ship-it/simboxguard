import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Pencil, Trash2, X, Check } from 'lucide-react';
import { showSuccess, showError } from '../../utils/toast';
import { apiFetch } from '../../lib/api';

type Role = 'AGENT_MTN' | 'AGENT_AIRTEL' | 'ANALYSTE' | 'ARPCE';
type Operateur = 'MTN' | 'AIRTEL' | '';

interface AppUser {
  id: string;
  nom: string;
  email: string;
  role: Role;
  operateur: Operateur | null;
  created_at: string;
}

const ROLE_LABELS: Record<Role, string> = {
  AGENT_MTN: 'Agent MTN',
  AGENT_AIRTEL: 'Agent Airtel',
  ANALYSTE: 'Analyste Fraude',
  ARPCE: 'Contrôleur ARPCE',
};

const ROLE_COLORS: Record<Role, string> = {
  AGENT_MTN: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  AGENT_AIRTEL: 'bg-red-500/10 text-red-400 border-red-500/20',
  ANALYSTE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ARPCE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const emptyForm = { nom: '', email: '', role: 'ANALYSTE' as Role, operateur: '' as Operateur, password: '' };

const inputCls = 'w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500';
const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1';

const ArpceUsers = () => {
  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [form, setForm]       = useState(emptyForm);
  const [busy, setBusy]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
      .catch(() => showError('Erreur chargement des utilisateurs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditTarget(null);
    setModal('create');
  };

  const openEdit = (u: AppUser) => {
    setForm({ nom: u.nom, email: u.email, role: u.role, operateur: u.operateur ?? '', password: '' });
    setEditTarget(u);
    setModal('edit');
  };

  const handleSubmit = async () => {
    if (!form.nom.trim() || !form.email.trim() || !form.role) {
      return showError('Nom, email et rôle sont requis');
    }
    if (modal === 'create' && !form.password.trim()) {
      return showError('Le mot de passe est requis pour un nouvel utilisateur');
    }
    setBusy(true);
    try {
      const body: Record<string, string> = {
        nom: form.nom, email: form.email, role: form.role,
        operateur: form.operateur || '',
      };
      if (form.password) body.password = form.password;

      const url    = modal === 'create' ? apiUrl('/api/users') : apiUrl(`/api/users/${editTarget!.id}`);
      const method = modal === 'create' ? 'POST' : 'PATCH';
      const resp   = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data   = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      showSuccess(modal === 'create' ? `Utilisateur ${data.nom} créé ✓` : `Utilisateur mis à jour ✓`);
      setModal(null);
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      const resp = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      showSuccess('Utilisateur supprimé ✓');
      setConfirmDelete(null);
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const needsOperateur = form.role === 'AGENT_MTN' || form.role === 'AGENT_AIRTEL';

  return (
    <DashboardLayout title="Gestion des utilisateurs">

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users size={18} className="text-purple-400" />
          <span className="text-sm text-slate-400">{users.length} utilisateur(s) enregistré(s)</span>
        </div>
        <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2">
          <UserPlus size={15} /> Nouvel utilisateur
        </Button>
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Users size={14} className="text-purple-400" /> Comptes actifs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm py-8 text-center">Chargement...</p>
          ) : users.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Aucun utilisateur.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <th className="text-left pb-3 pr-4">Nom</th>
                    <th className="text-left pb-3 pr-4">Email</th>
                    <th className="text-left pb-3 pr-4">Rôle</th>
                    <th className="text-left pb-3 pr-4">Opérateur</th>
                    <th className="text-left pb-3">Créé le</th>
                    <th className="text-right pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/3 transition-colors">
                      <td className="py-3 pr-4 font-bold text-white">{u.nom}</td>
                      <td className="py-3 pr-4 text-slate-300 font-mono text-xs">{u.email}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-400 text-xs">{u.operateur ?? '—'}</td>
                      <td className="py-3 text-slate-500 text-xs">
                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 text-right">
                        {confirmDelete === u.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-red-400">Confirmer ?</span>
                            <button onClick={() => handleDelete(u.id)} disabled={busy}
                              className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                              <Check size={13} />
                            </button>
                            <button onClick={() => setConfirmDelete(null)}
                              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(u)}
                              className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => setConfirmDelete(u.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal création / édition */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  {modal === 'create' ? <UserPlus size={18} className="text-purple-400" /> : <Pencil size={18} className="text-purple-400" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {modal === 'create' ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}
                  </h2>
                  <p className="text-xs text-slate-400">{modal === 'edit' && editTarget?.email}</p>
                </div>
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelCls}>Nom complet</label>
                <input className={inputCls} placeholder="EX : DUPONT Jean" value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Adresse email</label>
                <input type="email" className={inputCls} placeholder="nom@domaine.cg" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Rôle</label>
                <select className={inputCls} value={form.role}
                  onChange={e => {
                    const r = e.target.value as Role;
                    setForm(f => ({
                      ...f,
                      role: r,
                      operateur: r === 'AGENT_MTN' ? 'MTN' : r === 'AGENT_AIRTEL' ? 'AIRTEL' : '',
                    }));
                  }}>
                  <option value="AGENT_MTN" className="bg-slate-900">Agent MTN</option>
                  <option value="AGENT_AIRTEL" className="bg-slate-900">Agent Airtel</option>
                  <option value="ANALYSTE" className="bg-slate-900">Analyste Fraude</option>
                  <option value="ARPCE" className="bg-slate-900">Contrôleur ARPCE</option>
                </select>
              </div>
              {needsOperateur && (
                <div>
                  <label className={labelCls}>Opérateur</label>
                  <select className={inputCls} value={form.operateur}
                    onChange={e => setForm(f => ({ ...f, operateur: e.target.value as Operateur }))}>
                    <option value="MTN" className="bg-slate-900">MTN</option>
                    <option value="AIRTEL" className="bg-slate-900">AIRTEL</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>
                  {modal === 'edit' ? 'Nouveau mot de passe (laisser vide = inchangé)' : 'Mot de passe'}
                </label>
                <input type="password" className={inputCls} placeholder="••••••••" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSubmit} disabled={busy}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold">
                {busy ? 'Enregistrement...' : modal === 'create' ? 'Créer' : 'Enregistrer'}
              </Button>
              <Button variant="outline" onClick={() => setModal(null)} disabled={busy}
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

export default ArpceUsers;
