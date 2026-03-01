export interface UploadResult {
  key: string;
}

export async function uploadFileToR2(input: {
  bucket: R2Bucket;
  equipmentId: string;
  kind: "image" | "audio";
  file: File;
}): Promise<UploadResult> {
  const extension = extensionFromMimeType(input.file.type);
  const key = `${sanitizePathSegment(input.equipmentId)}/${Date.now()}-${crypto.randomUUID()}-${input.kind}.${extension}`;

  await input.bucket.put(key, await input.file.arrayBuffer(), {
    httpMetadata: {
      contentType: input.file.type,
    },
    customMetadata: {
      equipment_id: input.equipmentId,
      media_kind: input.kind,
    },
  });

  return { key };
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return "bin";
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
