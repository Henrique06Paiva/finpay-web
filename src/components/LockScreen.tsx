import React, { useEffect, useState } from 'react';
import { Delete, ScanFace } from 'lucide-react';
import { hashPin, verifyBiometrics } from '../services/securityService';
import { haptic } from '../services/hapticService';

interface LockScreenProps {
  expectedPinHash: string;
  biometricsEnabled: boolean;
  credentialId?: string | null;
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  expectedPinHash,
  biometricsEnabled,
  credentialId,
  onUnlock,
}) => {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  const isLockedOut = lockedUntil > nowMs;
  const remainingLockSec = Math.max(0, Math.ceil((lockedUntil - nowMs) / 1000));

  useEffect(() => {
    if (!isLockedOut) return;
    const timer = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isLockedOut]);

  const handleBiometricUnlock = async () => {
    const ok = await verifyBiometrics(credentialId);
    if (ok) {
      haptic.success();
      onUnlock();
    } else {
      haptic.error();
    }
  };

  // Se o Face ID estiver ativo, já aciona automaticamente ao abrir a tela de bloqueio
  useEffect(() => {
    if (biometricsEnabled) {
      handleBiometricUnlock();
    }
  }, [biometricsEnabled]);

  const handleDigit = async (d: string) => {
    if (isLockedOut || digits.length >= 4) return;
    haptic.tap();
    const next = digits + d;
    setDigits(next);
    setError(false);

    if (next.length === 4) {
      const hashed = await hashPin(next);
      if (hashed === expectedPinHash) {
        haptic.success();
        setDigits('');
        setFailedAttempts(0);
        onUnlock();
      } else {
        haptic.error();
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);
        setError(true);
        if (nextFailed >= 5) {
          const until = Date.now() + 30000;
          setLockedUntil(until);
          setNowMs(Date.now());
        }
        setTimeout(() => setDigits(''), 450);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F6F5F2] flex flex-col items-center justify-center px-6 select-none">
      <img
        src="/icon.svg"
        alt="FinPay"
        className="w-16 h-16 rounded-2xl mb-4 shadow-xl shadow-emerald-950/20 border border-black/5"
      />
      <h1 className="text-lg font-bold text-neutral-950">FinPay</h1>
      <p className="text-xs text-neutral-500 mt-1 mb-8">
        {isLockedOut ? (
          <span className="text-red-600 font-semibold">
            Muitas tentativas. Aguarde {remainingLockSec}s
          </span>
        ) : error ? (
          <span className="text-red-600 font-semibold">
            PIN incorreto ({5 - failedAttempts} tentativa{5 - failedAttempts === 1 ? '' : 's'} restante{5 - failedAttempts === 1 ? '' : 's'})
          </span>
        ) : biometricsEnabled ? (
          'Use o Face ID ou digite seu PIN'
        ) : (
          'Digite seu PIN de 4 dígitos'
        )}
      </p>

      {biometricsEnabled && (
        <button
          onClick={handleBiometricUnlock}
          className="mb-8 px-4 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-2 shadow-md active:scale-95 transition"
        >
          <ScanFace className="w-4 h-4" /> Entrar com Face ID
        </button>
      )}

      {/* Indicadores do PIN */}
      <div className="flex gap-4 mb-10">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full transition-all ${
              digits.length > i
                ? 'bg-neutral-950 scale-110'
                : error
                ? 'border-2 border-red-500'
                : 'border-2 border-neutral-300'
            }`}
          />
        ))}
      </div>

      {/* Teclado Minimalista */}
      <div className="grid grid-cols-3 gap-4 w-64">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <button
            key={num}
            onClick={() => handleDigit(num)}
            className="h-16 rounded-full bg-white border border-neutral-200/80 text-xl font-semibold text-neutral-950 active:bg-neutral-200 transition tabular-nums"
          >
            {num}
          </button>
        ))}

        {biometricsEnabled ? (
          <button
            onClick={handleBiometricUnlock}
            className="h-16 rounded-full flex items-center justify-center text-neutral-900 active:scale-90 transition"
            title="Face ID"
          >
            <ScanFace className="w-6 h-6" />
          </button>
        ) : (
          <div />
        )}

        <button
          onClick={() => handleDigit('0')}
          className="h-16 rounded-full bg-white border border-neutral-200/80 text-xl font-semibold text-neutral-950 active:bg-neutral-200 transition tabular-nums"
        >
          0
        </button>

        <button
          onClick={() => {
            haptic.tap();
            setDigits((prev) => prev.slice(0, -1));
          }}
          className="h-16 rounded-full flex items-center justify-center text-neutral-400 active:text-neutral-950 transition"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
