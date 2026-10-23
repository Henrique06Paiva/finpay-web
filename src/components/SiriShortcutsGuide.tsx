import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  Mic,
  Share2,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';

interface SiriShortcutsGuideProps {
  appUrl?: string;
}

export const SiriShortcutsGuide: React.FC<SiriShortcutsGuideProps> = ({
  appUrl = window?.location?.origin || 'https://turbo-spruce-zzm9bal.vercel.app',
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const shortcutExamples = [
    {
      title: 'Registrar Gasto Rápido com a Siri',
      voicePhrase: '"E aí Siri, gastei 45 no almoço"',
      urlScheme: `${appUrl}/?add=expense&val=45.00&desc=Almoco&cat=alimentacao`,
      description: 'Abre o app direto com valor, descrição e categoria pré-preenchidos para confirmação com 1 toque.',
    },
    {
      title: 'Registrar Entrada / Pix Recebido',
      voicePhrase: '"E aí Siri, recebi 250 de freela"',
      urlScheme: `${appUrl}/?add=income&val=250.00&desc=Freela&cat=servicos`,
      description: 'Lança uma nova receita creditada em conta.',
    },
    {
      title: 'Abrir Painel de Quitação de Dívidas',
      voicePhrase: '"E aí Siri, simular dívidas"',
      urlScheme: `${appUrl}/?tab=debts`,
      description: 'Navega instantaneamente para a aba de Dívidas e simulação Price vs SAC.',
    },
    {
      title: 'Consultar Cotações do Dólar & Selic',
      voicePhrase: '"E aí Siri, metas e mercado"',
      urlScheme: `${appUrl}/?tab=goals`,
      description: 'Abre o painel de cotações em tempo real do Banco Central e AwesomeAPI.',
    },
  ];

  const handleCopy = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  return (
    <div className="editorial-card rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-neutral-950 text-white flex items-center justify-center shadow-xs">
            <Mic className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-950 flex items-center gap-1.5">
              Atalhos da Siri & Webhooks <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </h3>
            <p className="text-[11px] text-neutral-500">
              Controle o FinPay por voz no iOS ou via automações
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px] uppercase tracking-wider">
          iOS Shortcuts
        </span>
      </div>

      <div className="p-3.5 bg-gradient-to-br from-purple-50 to-neutral-50 rounded-2xl border border-purple-100 text-xs space-y-2 text-neutral-700">
        <p className="font-semibold text-neutral-900 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-purple-600" /> Como configurar no app Atalhos (Shortcuts) do iPhone:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-neutral-600">
          <li>Abra o aplicativo <strong>Atalhos (Shortcuts)</strong> nativo do seu iPhone.</li>
          <li>Toque em <strong>+</strong> e adicione a ação <strong>"Abrir URLs" (Open URLs)</strong>.</li>
          <li>Cole uma das URLs abaixo e configure um comando de voz falado com a Siri!</li>
        </ol>
      </div>

      <div className="space-y-3">
        {shortcutExamples.map((item, idx) => (
          <div
            key={idx}
            className="p-3 bg-[#F6F5F2] rounded-2xl border border-neutral-200/60 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900">{item.title}</span>
              <button
                onClick={() => handleCopy(item.urlScheme, idx)}
                className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-neutral-800 text-[10px] font-semibold flex items-center gap-1 hover:bg-neutral-50"
              >
                {copiedIndex === idx ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copiar Link
                  </>
                )}
              </button>
            </div>

            <div className="p-2 bg-white rounded-xl border border-neutral-100 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
              <span className="text-[11px] text-purple-950 font-medium italic">
                {item.voicePhrase}
              </span>
            </div>

            <p className="text-[10px] text-neutral-500 leading-tight">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
