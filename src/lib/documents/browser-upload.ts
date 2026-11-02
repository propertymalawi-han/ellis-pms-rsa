import { PROPERTY_DOCUMENTS_BUCKET } from "@/lib/documents/labels";
import { createClient } from "@/lib/supabase/client";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export async function uploadPropertyDocumentFile(
  path: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const { url, anonKey } = requireSupabasePublicEnv();
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("You need to sign in.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error("You need to sign in.");
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const endpoint = `${url}/storage/v1/object/${PROPERTY_DOCUMENTS_BUCKET}/${encodedPath}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      console.error(`Storage upload failed (${xhr.status})`);
      reject(new Error(uploadErrorMessage(xhr.status)));
    };

    xhr.onerror = () => {
      reject(new Error("Could not upload the file."));
    };

    xhr.send(file);
  });
}

function uploadErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "You do not have access to upload to this property.";
  }

  if (status === 409) {
    return "Could not upload the file. Try again.";
  }

  if (status === 400 || status === 413) {
    return "Could not upload the file. Check the type and size, then try again.";
  }

  return "Could not upload the file.";
}
