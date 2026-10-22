// Passwörter und Zugangscodes: Argon2id (OWASP-Empfehlung: m=19 MiB, t=2, p=1).
import { hashSync, verifySync } from '@node-rs/argon2';

// algorithm 2 = Argon2id (const enum aus @node-rs/argon2)
const OPTS = { algorithm: 2 as any, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashSecret(secret: string): string {
  return hashSync(secret.normalize('NFKC'), OPTS);
}

export function verifySecret(hash: string | null | undefined, secret: string): boolean {
  if (!hash) {
    // Gleiche Rechenzeit auch ohne Hash, damit Antwortzeiten nichts verraten
    verifySync(DUMMY, 'x');
    return false;
  }
  try {
    return verifySync(hash, secret.normalize('NFKC'));
  } catch {
    return false;
  }
}

const DUMMY = hashSync('paraph-dummy', OPTS);
