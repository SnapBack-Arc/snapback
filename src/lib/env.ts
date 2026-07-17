/**
 * Small helpers to read required env vars with a clear error when missing.
 * Keeps the "which secret didn't I set?" failure mode obvious in dev.
 */

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required server env var: ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}

export function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required public env var: ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}
