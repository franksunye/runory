import { BusinessError, ERROR_CODES } from "@runory/platform-core";

/**
 * Optional scanner protocol: POST the original bytes with Content-Type and
 * X-Content-SHA256. Only { clean: true, sha256: <same digest> } is accepted.
 * The endpoint is deployment-owned, never supplied by an upload request.
 */
export async function scanAttachment(
  bytes: Uint8Array,
  contentType: string,
  sha256: string,
): Promise<"clean" | "not_configured"> {
  const endpoint = process.env.MALWARE_SCAN_ENDPOINT?.trim();
  if (!endpoint) {
    if (process.env.RUNORY_MALWARE_SCAN_REQUIRED === "true") {
      throw new BusinessError(ERROR_CODES.INTERNAL_ERROR, "Attachment scanning is not configured", 503);
    }
    return "not_configured";
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BusinessError(ERROR_CODES.INTERNAL_ERROR, "Attachment scanner configuration is invalid", 503);
  }
  const isLocalDev = process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
  const localHttp = isLocalDev && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
    throw new BusinessError(ERROR_CODES.INTERNAL_ERROR, "Attachment scanner requires an approved HTTPS endpoint", 503);
  }

  let result: { clean?: unknown; sha256?: unknown };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "X-Content-SHA256": sha256,
        ...(process.env.MALWARE_SCAN_TOKEN
          ? { Authorization: `Bearer ${process.env.MALWARE_SCAN_TOKEN}` }
          : {}),
      },
      body: new Uint8Array(bytes),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Scanner unavailable");
    result = await response.json();
    if (!result || typeof result !== "object") throw new Error("Invalid scan result");
  } catch {
    // Do not disclose scanner URLs, credentials, or provider response bodies.
    throw new BusinessError(ERROR_CODES.INTERNAL_ERROR, "Attachment scanning is unavailable; upload was not accepted", 503);
  }
  if (result.clean === false) {
    throw new BusinessError(ERROR_CODES.INVALID_INPUT, "Attachment failed the security scan", 422);
  }
  if (result.clean !== true || result.sha256 !== sha256) {
    throw new BusinessError(ERROR_CODES.INTERNAL_ERROR, "Attachment scanner did not verify this file; upload was not accepted", 503);
  }
  return "clean";
}
