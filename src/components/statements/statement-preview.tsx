export function StatementPreview({
  url,
  mimeType,
}: {
  url: string;
  mimeType: string;
}) {
  const image = mimeType.startsWith("image/");

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-medium">Statement</h2>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline-offset-4 hover:underline"
        >
          Open in a new tab
        </a>
      </div>
      {image ? (
        // The signed URL is temporary and is not a configured image host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Owner's statement"
          className="max-h-[32rem] w-full rounded-lg border object-contain"
        />
      ) : (
        <iframe
          title="Owner's statement"
          src={url}
          className="h-[32rem] w-full rounded-lg border bg-muted"
        />
      )}
    </div>
  );
}
