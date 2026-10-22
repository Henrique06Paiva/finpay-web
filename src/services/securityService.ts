// Autenticação Apple Face ID / Touch ID (WebAuthn Platform Authenticator) + PIN + Criptografia

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`aura_ios_salt_v2_${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function registerBiometrics(): Promise<{
  ok: boolean;
  credentialId?: string;
  error?: string;
}> {
  if (!isWebAuthnAvailable()) {
    return {
      ok: false,
      error: 'O Face ID requer conexão segura (HTTPS, como o link da Vercel) no Safari do iPhone.',
    };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Finanças iOS',
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: 'titular@iphone.local',
          displayName: 'Titular do iPhone',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256 (Secure Enclave do iPhone)
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, error: 'Operação cancelada.' };
    }

    return {
      ok: true,
      credentialId: bufferToBase64Url(credential.rawId),
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.name === 'NotAllowedError'
          ? 'Permissão do Face ID cancelada ou negada.'
          : 'Abra pelo link HTTPS da Vercel no iPhone para ativar o Face ID.',
    };
  }
}

export async function verifyBiometrics(credentialId?: string | null): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const allowCredentials: PublicKeyCredentialDescriptor[] = credentialId
      ? [
          {
            id: base64UrlToUint8Array(credentialId),
            type: 'public-key',
            transports: ['internal'],
          },
        ]
      : [];

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return Boolean(assertion);
  } catch {
    return false;
  }
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const DEFAULT_BACKUP_KEY = 'aura_local_vault_aes256_gcm_v3';

export async function encryptBackupPayload(
  jsonString: string,
  passphrase: string = DEFAULT_BACKUP_KEY
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoded = new TextEncoder().encode(jsonString);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded as BufferSource
  );

  return JSON.stringify({
    auraEncryptedBackup: true,
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256-100K',
    salt: bufferToBase64Url(salt.buffer),
    iv: bufferToBase64Url(iv.buffer),
    ciphertext: bufferToBase64Url(cipherBuf),
    createdAt: new Date().toISOString(),
  });
}

export async function decryptBackupPayload(
  rawContent: string,
  passphrase: string = DEFAULT_BACKUP_KEY
): Promise<string> {
  const parsed = JSON.parse(rawContent);
  // Compatibilidade com backups legados em JSON puro
  if (!parsed || !parsed.auraEncryptedBackup) {
    return rawContent;
  }

  const salt = base64UrlToUint8Array(parsed.salt);
  const iv = base64UrlToUint8Array(parsed.iv);
  const ciphertext = base64UrlToUint8Array(parsed.ciphertext);
  const key = await deriveAesKey(passphrase, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );

  return new TextDecoder().decode(plainBuf);
}
