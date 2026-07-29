/**
 * v0.9.2 PWA Notification — VAPID configuration and push capability status.
 *
 * Spec: v0.9 PWA Notification Technical Spec §9 (API boundary)
 */

export interface PushConfig {
  configured: boolean;
  publicKey: string | null;
  subject: string | null;
}

export function getPushConfig(): PushConfig {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || null;
  const subject = process.env.VAPID_SUBJECT?.trim() || null;

  return {
    configured: !!(publicKey && privateKey && subject),
    publicKey,
    subject,
  };
}

export function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    throw new Error("PUSH_NOT_CONFIGURED");
  }

  return { publicKey, privateKey, subject };
}
