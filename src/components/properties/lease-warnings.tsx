import { TriangleAlert } from "lucide-react";

export function LeaseWarnings({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-6 flex gap-2 rounded-lg border border-foreground/15 bg-muted px-3 py-2 text-sm"
      role="status"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid gap-1">
        <h2 className="sr-only">Lease reminders</h2>
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </div>
  );
}
