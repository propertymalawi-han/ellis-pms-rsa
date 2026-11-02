import { PROPERTY_DOCUMENTS_BUCKET, SIGNED_URL_SECONDS } from "@/lib/documents/labels";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export type SignedPreview = {
  previewUrl: string | null;
  thumbnailUrl: string | null;
  previewExpiresAt: string;
};

export async function signDocumentPreviews(
  supabase: Client,
  items: { id: string; filePath: string; thumbnailPath: string | null }[],
): Promise<Map<string, SignedPreview>> {
  const previewExpiresAt = new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString();
  const paths = [
    ...new Set(
      items.flatMap((item) =>
        item.thumbnailPath ? [item.filePath, item.thumbnailPath] : [item.filePath],
      ),
    ),
  ];
  const signed = new Map<string, string>();

  if (paths.length > 0) {
    const { data, error } = await supabase.storage
      .from(PROPERTY_DOCUMENTS_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);

    if (error) {
      console.error(error.message);
    } else {
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) {
          signed.set(row.path, row.signedUrl);
        }
      }
    }
  }

  return new Map(
    items.map((item) => [
      item.id,
      {
        previewUrl: signed.get(item.filePath) ?? null,
        thumbnailUrl: item.thumbnailPath ? (signed.get(item.thumbnailPath) ?? null) : null,
        previewExpiresAt,
      },
    ]),
  );
}
