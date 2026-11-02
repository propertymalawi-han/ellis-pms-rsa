const MAX_WIDTH = 2000;
const THUMB_WIDTH = 300;
const QUALITY = 0.8;

export async function prepareDocumentUpload(file: File): Promise<{
  file: File;
  thumbnail: File | null;
}> {
  if (!file.type.startsWith("image/")) {
    return { file, thumbnail: null };
  }

  const bitmap = await createImageBitmap(file);

  try {
    const type = file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const extension = type === "image/webp" ? "webp" : "jpg";
    const prepared = await renderImage(
      bitmap,
      Math.min(bitmap.width, MAX_WIDTH),
      type,
      replaceExtension(file.name, extension),
    );
    const thumbnail = await renderImage(
      bitmap,
      Math.min(bitmap.width, THUMB_WIDTH),
      "image/jpeg",
      "thumbnail.jpg",
    );

    return { file: prepared, thumbnail };
  } finally {
    bitmap.close();
  }
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "document";
  return `${base}.${extension}`;
}

function renderImage(
  bitmap: ImageBitmap,
  maxWidth: number,
  type: string,
  name: string,
): Promise<File> {
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.reject(new Error("Could not prepare the image."));
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not prepare the image."));
          return;
        }

        resolve(new File([blob], name, { type, lastModified: Date.now() }));
      },
      type,
      QUALITY,
    );
  });
}
