import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Heart,
  Mic,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react';
import { haptic } from '../services/hapticService';
import { CURRENT_SYSTEM_VERSION } from '../data/version';

export { CURRENT_SYSTEM_VERSION };

interface UpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToProfileSettings: () => void;
}

export const UpdatesModal: React.FC<UpdatesModalProps> = ({
  isOpen,
  onClose,
  onNavigateToProfileSettings,
}) => {
  if (!isOpen) return null;

  const handleGoToProfile = () => {
    haptic.tap();
    onNavigateToProfileSettings();
  };

  const handleMarkAsRead = () => {
    haptic.success();
    localStorage.setItem('finpay_last_seen_version', CURRENT_SYSTEM_VERSION);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#F6F5F2] text-neutral-900 p-5 sm:p-6 space-y-4 shadow-2xl animate-view max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-950 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-950 leading-tight">
                  Novidades & Atualizações
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-extrabold uppercase tracking-wider">
                  v2.2
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Saiba o que mudou no FinPay e como ativar novos recursos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-neutral-200/80 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition flex-shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CARD PRINCIPAL EM DESTAQUE: MODO CASAL */}
        <section className="editorial-card rounded-3xl p-5 space-y-3.5 bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                <Heart className="w-4 h-4 fill-white text-white" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-md">
                Destaque da Versão
              </span>
            </div>
            <span className="text-[11px] text-pink-100 font-semibold">Novo Recurso</span>
          </div>

          <div>
            <h4 className="text-base font-bold leading-snug">
              💑 Modo Casal (Conta Conjunta & Finanças a Dois)
            </h4>
            <p className="text-xs text-pink-100 leading-relaxed mt-1">
              Desenvolvido especialmente para casais que planejam o futuro juntos, dividem despesas da casa e querem manter a harmonia financeira.
            </p>
          </div>

          {/* Onde encontrar se a conta já existe */}
          <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 space-y-2">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Como ativar se sua conta já está criada?
            </p>
            <ol className="text-xs text-pink-100 space-y-1 list-decimal list-inside leading-relaxed">
              <li>Acesse a aba <strong>Ajustes</strong> (no menu ou topo).</li>
              <li>Toque na seção <strong>Perfil</strong>.</li>
              <li>Ative a chave <strong>Modo Casal (Conta Conjunta)</strong>.</li>
              <li>Informe os nomes dos dois parceiros e a regra de divisão!</li>
            </ol>
          </div>

          {/* O que o recurso faz */}
          <div className="space-y-1.5 text-xs text-pink-100">
            <p className="flex items-start gap-1.5">
              <span className="text-white font-bold">🏠</span>
              <span><strong>Despesas Comuns vs Pessoais:</strong> Ao lançar um gasto, escolha quem pagou e se é da casa ou individual.</span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-white font-bold">⚖️</span>
              <span><strong>Acerto Automático no Dashboard:</strong> O app calcula na hora quem deve transferir quanto para quem no mês.</span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-white font-bold">👥</span>
              <span><strong>Titularidade de Contas:</strong> Crie contas conjuntas ou individuais separadas.</span>
            </p>
          </div>

          {/* Botão de Atalho Direto para Ajustes > Perfil */}
          <button
            type="button"
            onClick={handleGoToProfile}
            className="w-full py-3 px-4 rounded-2xl bg-white text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:bg-neutral-100 active:scale-[0.98] transition"
          >
            <span>Ir para Ajustes ➔ Perfil e Ativar Agora</span>
            <ArrowRight className="w-4 h-4 text-purple-700" />
          </button>
        </section>

        {/* OUTROS RECURSOS RECENTES */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-1">
            Outros Recursos Disponíveis
          </p>

          <div className="editorial-card rounded-2xl p-3.5 flex items-start gap-3 bg-white">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900">
                Sincronização em Nuvem sem Limites (PostgreSQL)
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5">
                Seus lançamentos agora são salvos e sincronizados com segurança no banco em nuvem AWS São Paulo, sem limite de quantidade.
              </p>
            </div>
          </div>

          <div className="editorial-card rounded-2xl p-3.5 flex items-start gap-3 bg-white">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900">
                Holerite CLT & Salário Automático
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5">
                Cálculo automático de INSS e IRRF das tabelas vigentes, com crédito projetado todo último dia útil.
              </p>
            </div>
          </div>

          <div className="editorial-card rounded-2xl p-3.5 flex items-start gap-3 bg-white">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Mic className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900">
                Atalhos da Siri & Webhooks no iOS
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5">
                Cadastre receitas e despesas por comando de voz com a Siri ou crie botões na tela de início do seu iPhone.
              </p>
            </div>
          </div>

          <div className="editorial-card rounded-2xl p-3.5 flex items-start gap-3 bg-white">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900">
                Sincronização Offline por QR Code
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5">
                Transfira dados entre dispositivos sem internet escaneando o QR Code criptografado.
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé e botão de marcar como lido */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-400">
            Você pode rever estas novidades a qualquer momento tocando no ícone ✨ no topo da tela.
          </span>
          <button
            type="button"
            onClick={handleMarkAsRead}
            className="px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-900 active:scale-95 transition flex-shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Entendi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
