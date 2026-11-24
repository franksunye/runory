export interface AttachmentUploadPolicy {
  maxFileSizeBytes: number;
  allowedContentTypes: string[];
}

/** Leave multipart overhead below Vercel's 4.5 MB Function request limit. */
export function attachmentUploadPolicy(): AttachmentUploadPolicy {
  return {
    maxFileSizeBytes: (process.env.VERCEL === "1" ? 4 : 10) * 1024 * 1024,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"],
  };
}
