import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  QrCode,
  RefreshCw,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { FinanceState } from '../types/finance';
import {
  buildSyncPayload,
  CrossPlatformSyncPayload,
  mergeSyncPayload,
} from '../services/syncService';
import { formatBRL } from '../utils/format';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  fullState: FinanceState;
  onApplyState: (newState: FinanceState) => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  fullState,
  onApplyState,
}) => {
  const [tab, setTab] = useState<'export' | 'scan'>('export');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [payloadJson, setPayloadJson] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Câmera / Leitor
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedPayload, setScannedPayload] = useState<CrossPlatformSyncPayload | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Gera o QR Code com dados estruturados do app
  useEffect(() => {
    if (isOpen) {
      const payload = buildSyncPayload(fullState);
      const json = JSON.stringify(payload);
      setPayloadJson(json);

      QRCode.toDataURL(json, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#051C22',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Erro ao gerar QR Code:', err));
    }
  }, [isOpen, fullState]);

  // Gerenciamento do leitor de câmera
  useEffect(() => {
    if (!isScanning) {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      return;
    }

    let activeStream: MediaStream | null = null;

    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: 'environment' },
      })
      .then((stream) => {
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();
          requestAnimationFrame(tickScanner);
        }
      })
      .catch((err) => {
        setScanError('Não foi possível acessar a câmera. Verifique as permissões.');
        setIsScanning(false);
      });

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, [isScanning]);

  const tickScanner = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.height = videoRef.current.videoHeight;
          canvas.width = videoRef.current.videoWidth;
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            try {
              const parsed = JSON.parse(code.data) as CrossPlatformSyncPayload;
              if (parsed.protocol === 'finpay_sync_v1') {
                setScannedPayload(parsed);
                setIsScanning(false);
                return;
              }
            } catch {
              // não é um JSON válido do FinPay, continua escaneando
            }
          }
        }
      }
    }
    animFrameId.current = requestAnimationFrame(tickScanner);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(payloadJson);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const handleApplyImportedData = () => {
    if (!scannedPayload) return;
    try {
      const merged = mergeSyncPayload(fullState, scannedPayload);
      onApplyState(merged);
      setScanSuccess(true);
      setTimeout(() => {
        setScanSuccess(false);
        setScannedPayload(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setScanError(err?.message || 'Falha ao sincronizar dados.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as CrossPlatformSyncPayload;
        if (parsed.protocol === 'finpay_sync_v1') {
          setScannedPayload(parsed);
          setScanError(null);
        } else {
          setScanError('Arquivo incompatível com o protocolo FinPay Sync.');
        }
      } catch {
        setScanError('Arquivo JSON corrompido ou inválido.');
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto animate-view">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-neutral-950 text-white flex items-center justify-center shadow-xs">
              <QrCode className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-950">
                Sincronização Offline
              </h3>
              <p className="text-[11px] text-neutral-500">
                iPhone (iOS) ⇄ Android / PAX A910
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center hover:bg-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs Exportar / Escanear */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F6F5F2] rounded-2xl my-4">
          <button
            onClick={() => {
              setTab('export');
              setIsScanning(false);
            }}
            className={`py-2 text-xs font-semibold rounded-xl transition ${
              tab === 'export'
                ? 'bg-white text-neutral-950 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            Gerar QR Code
          </button>
          <button
            onClick={() => setTab('scan')}
            className={`py-2 text-xs font-semibold rounded-xl transition ${
              tab === 'scan'
                ? 'bg-white text-neutral-950 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            Ler QR do Android
          </button>
        </div>

        {/* 1. ABA EXPORTAR QR CODE */}
        {tab === 'export' && (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-[#F6F5F2] rounded-2xl border border-neutral-100 inline-block mx-auto shadow-inner">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code de Sincronização FinPay"
                  className="w-64 h-64 rounded-xl mx-auto"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-xs text-neutral-400">
                  Gerando código de pareamento...
                </div>
              )}
            </div>

            <div className="p-3 bg-emerald-50 text-emerald-900 rounded-2xl text-[11px] text-left space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
                Como transferir para o Android / PAX:
              </p>
              <p className="text-emerald-800 leading-relaxed">
                Abra o FinPay na máquina ou smartphone e aponte a câmera para este QR.
                Suas contas, dívidas, metas e transações serão transferidas localmente sem internet!
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCopyJson}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-neutral-100 text-neutral-800 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-neutral-200 transition"
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copiar Código
                  </>
                )}
              </button>
              <a
                href={qrDataUrl}
                download="finpay_sync_qrcode.png"
                className="py-2.5 px-4 rounded-2xl bg-neutral-950 text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-neutral-900 transition"
              >
                <Download className="w-4 h-4" /> Baixar Imagem
              </a>
            </div>
          </div>
        )}

        {/* 2. ABA ESCANEAR QR DO ANDROID */}
        {tab === 'scan' && (
          <div className="space-y-4">
            {!scannedPayload ? (
              <div className="space-y-3">
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-neutral-950 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {!isScanning && (
                    <div className="absolute inset-0 bg-neutral-950/80 flex flex-col items-center justify-center p-4 text-center">
                      <Camera className="w-10 h-10 text-neutral-400 mb-2" />
                      <p className="text-xs text-neutral-300 font-medium">
                        Aponte para a tela da PAX A910 ou Android
                      </p>
                      <button
                        onClick={() => {
                          setScanError(null);
                          setIsScanning(true);
                        }}
                        className="mt-3 py-2.5 px-4 bg-emerald-500 text-neutral-950 rounded-2xl font-bold text-xs flex items-center gap-1.5 shadow-lg"
                      >
                        <Camera className="w-4 h-4" /> Ativar Câmera
                      </button>
                    </div>
                  )}

                  {isScanning && (
                    <div className="absolute inset-6 border-2 border-emerald-400/80 rounded-2xl pointer-events-none animate-pulse" />
                  )}
                </div>

                {scanError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-2xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{scanError}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500">Ou envie o arquivo JSON exportado:</span>
                  <label className="py-2 px-3 rounded-xl bg-neutral-100 text-neutral-800 text-xs font-semibold cursor-pointer flex items-center gap-1.5 hover:bg-neutral-200">
                    <Upload className="w-3.5 h-3.5" /> Escolher Arquivo
                    <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            ) : (
              /* Pré-visualização dos dados escaneados antes de mesclar */
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-950">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs">Dados FinPay Identificados!</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Origem: <strong>{scannedPayload.sourceDevice}</strong> · Exportado em{' '}
                    {new Date(scannedPayload.exportedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="space-y-2 bg-[#F6F5F2] p-3 rounded-2xl text-xs">
                  <p className="font-semibold text-neutral-900 text-[11px] uppercase tracking-wider">
                    Resumo do Pacote:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-neutral-700">
                    <div className="bg-white p-2 rounded-xl">
                      <span className="text-neutral-400 block text-[10px]">Contas:</span>
                      <strong>{scannedPayload.accounts.length} contas</strong>
                    </div>
                    <div className="bg-white p-2 rounded-xl">
                      <span className="text-neutral-400 block text-[10px]">Transações:</span>
                      <strong>{scannedPayload.transactions.length} registros</strong>
                    </div>
                    <div className="bg-white p-2 rounded-xl">
                      <span className="text-neutral-400 block text-[10px]">Dívidas ativas:</span>
                      <strong>{scannedPayload.debts.length} contratos</strong>
                    </div>
                    <div className="bg-white p-2 rounded-xl">
                      <span className="text-neutral-400 block text-[10px]">Metas:</span>
                      <strong>{scannedPayload.goals.length} objetivos</strong>
                    </div>
                  </div>
                </div>

                {scanSuccess ? (
                  <div className="p-3 bg-emerald-700 text-white rounded-2xl text-center text-xs font-bold">
                    ✓ Sincronização concluída com sucesso!
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScannedPayload(null)}
                      className="py-3 px-4 rounded-2xl bg-neutral-100 text-neutral-700 font-semibold text-xs flex-1"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleApplyImportedData}
                      className="py-3 px-4 rounded-2xl bg-neutral-950 text-white font-semibold text-xs flex-1 flex items-center justify-center gap-1.5"
                    >
                      Mesclar no iPhone <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
