import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { haptic } from '../services/hapticService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: { id: string; name: string; email: string }, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const endpoint = mode === 'register' ? '/api/register' : '/api/login';
      const body = mode === 'register' ? { name, email, password } : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Falha ao autenticar.');
      }

      haptic.success();
      // Salva o token JWT localmente
      localStorage.setItem('finpay_auth_token', data.token);
      localStorage.setItem('finpay_auth_user', JSON.stringify(data.user));

      onLoginSuccess(data.user, data.token);
      onClose();
    } catch (err: any) {
      haptic.error();
      setErrorMsg(err?.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col animate-view border border-neutral-100">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#0F3D3E] text-[#5EEAB4] flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-950">
                {mode === 'login' ? 'Entrar no FinPay' : 'Criar Conta Privada'}
              </h3>
              <p className="text-[11px] text-neutral-500">
                Seus dados isolados no PostgreSQL
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center hover:bg-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas Entrar / Criar Conta */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#F6F5F2] rounded-2xl my-4">
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              setMode('login');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-semibold rounded-xl transition ${
              mode === 'login'
                ? 'bg-white text-neutral-950 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            Fazer Login
          </button>
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              setMode('register');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-semibold rounded-xl transition ${
              mode === 'register'
                ? 'bg-white text-neutral-950 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            Cadastrar
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                Seu Nome
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-neutral-400 absolute left-3" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Henrique Paiva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-950"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
              E-mail
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-3" />
              <input
                type="email"
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-950"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
              Senha
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3" />
              <input
                type="password"
                required
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-950"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-2xl bg-neutral-950 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-50"
          >
            {loading ? (
              'Processando...'
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-4 h-4" /> Entrar na minha conta
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" /> Criar meu cofre na nuvem
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] text-neutral-400">
          🔒 Cada usuário possui seu próprio UUID exclusivo. Seus dados nunca se misturam.
        </p>
      </div>
    </div>
  );
};
