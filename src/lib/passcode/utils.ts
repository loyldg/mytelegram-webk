import {SALT_LENGTH} from './constants';


export async function hashPasscode(passcode: string, salt: Uint8Array) {
  const encoder = new TextEncoder();
  const passcodeBytes = encoder.encode(passcode);

  const key = await crypto.subtle.importKey('raw', passcodeBytes, {name: 'PBKDF2'}, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'},
    key,
    256
  );

  return new Uint8Array(derivedBits);
}

export async function deriveKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const wrappedPasscode = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passcode), {name: 'PBKDF2'}, false, ['deriveKey']
  );
  passcode = '';

  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'},
    wrappedPasscode, {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']
  );
}

export async function createEncryptionArtifactsFromPasscode(passcode: string) {
  const encryptionSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const verificationSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const encryptionKey = await deriveKey(passcode, encryptionSalt);
  const verificationHash = await hashPasscode(passcode, verificationSalt);

  return {verificationHash, verificationSalt, encryptionSalt, encryptionKey};
}
