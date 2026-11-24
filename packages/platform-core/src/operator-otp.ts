// Local delivery of the existing OTP challenge, not a new authentication method.
// Host/Docker administrators are the trusted recipients. No HTTP retrieval,
// development identity, provider credentials or persistent customer data.
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AuthenticationError } from "./context";

export const OPERATOR_OTP_DIRECTORY = "/runory-otp";
type Environment = Record<string, string | undefined>;

export function getOperatorOtpOwner(env: Environment = process.env): string | null {
  if (env.RUNORY_SELF_HOST_CANDIDATE !== "1" ||
      env.RUNORY_SELF_HOST_MAIL_MODE !== "operator" ||
      env.NODE_ENV !== "production" || env.PLATFORM_DEPLOYMENT_MODE !== "local" ||
      env.VERCEL === "1" || env.VERCEL_ENV ||
      env.PLATFORM_DEV_BOOTSTRAP !== "false" ||
      env.PLATFORM_TRUST_IDENTITY_HEADERS !== "false" ||
      env.PLATFORM_OTP_RETURN_DEV_CODE !== "false" ||
      env.LIBSQL_URL !== "file:/data/platform.db" || env.LIBSQL_AUTH_TOKEN ||
      !/^[a-f0-9]{40}$/.test(env.RUNORY_RELEASE_COMMIT ?? "")) return null;
  const owner = env.PLATFORM_ADMIN_EMAILS?.trim().toLowerCase() ?? "";
  return /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(owner) && owner.length <= 254 ? owner : null;
}

export function assertOperatorOtpRecipient(email: string): void {
  const owner = getOperatorOtpOwner();
  if (owner && owner !== email) {
    throw new AuthenticationError("Operator sign-in is restricted to the configured instance owner.");
  }
}

async function privateDirectory(root: string) {
  const entry = await lstat(root);
  if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o700 ||
      (process.getuid && entry.uid !== process.getuid())) {
    throw new Error("Operator OTP directory is not private");
  }
}

/** Internal file primitives accept a directory only for unit testing. The
 * runtime wrappers below always select the fixed, private tmpfs mount. */
export async function writeOperatorCode(root: string, email: string, code: string, expiresAt: string) {
  await privateDirectory(root);
  if (!/^\d{6}$/.test(code) || !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()) throw new Error("Invalid OTP delivery");
  const temporary = join(root, ".delivery-" + randomUUID());
  try {
    await writeFile(temporary, JSON.stringify({ email, code, expiresAt }), { flag: "wx", mode: 0o600 });
    // Atomic replacement means a new request invalidates the old mailbox
    // entry. The authoritative challenge expiry/attempts remain in the DB.
    await rename(temporary, join(root, "owner.json"));
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function takeOperatorCode(root: string, owner: string): Promise<string> {
  await privateDirectory(root);
  const claimed = join(root, ".claimed-" + randomUUID());
  // Only one terminal reader can claim this particular delivery.
  await rename(join(root, "owner.json"), claimed);
  try {
    const file = await open(claimed, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const entry = await file.stat();
      if (!entry.isFile() || (entry.mode & 0o777) !== 0o600 || entry.size > 1024 ||
          (process.getuid && entry.uid !== process.getuid())) throw new Error("Invalid private delivery");
      const message = JSON.parse(await file.readFile("utf8")) as { email?: string; code?: string; expiresAt?: string };
      if (message.email !== owner || !/^\d{6}$/.test(message.code ?? "") ||
          !Number.isFinite(Date.parse(message.expiresAt ?? "")) ||
          Date.parse(message.expiresAt!) <= Date.now()) throw new Error("No current owner code");
      return message.code!;
    } finally { await file.close(); }
  } finally { await unlink(claimed).catch(() => {}); }
}

export async function deliverOperatorOtp(email: string, code: string, expiresAt: string): Promise<boolean> {
  const owner = getOperatorOtpOwner();
  if (!owner) return false;
  assertOperatorOtpRecipient(email);
  try {
    await writeOperatorCode(OPERATOR_OTP_DIRECTORY, email, code, expiresAt);
    return true;
  } catch {
    // Never expose filesystem paths, code or delivery contents to HTTP/logs.
    throw new Error("Private operator OTP delivery failed");
  }
}

export async function takeConfiguredOwnerCode(): Promise<string> {
  const owner = getOperatorOtpOwner();
  if (!owner) throw new Error("Operator delivery is not enabled");
  return takeOperatorCode(OPERATOR_OTP_DIRECTORY, owner);
}
