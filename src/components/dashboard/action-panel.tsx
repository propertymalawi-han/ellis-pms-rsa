import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDateOnly, formatZAR } from "@/lib/format";
import { daysUntilExpiryLabel } from "@/lib/leases/warnings";
import type { AttentionItem, AttentionPanel } from "@/lib/reporting/attention";

export function ActionPanel({
  panel,
  today,
}: {
  panel: AttentionPanel;
  today: string;
}) {
  const sections: { title: string; empty: string; items: AttentionItem[]; lease?: boolean }[] = [
    {
      title: "Overdue rent invoices",
      empty: "No overdue rent.",
      items: panel.overdueInvoices,
    },
    {
      title: "Unpaid or overdue bills and expenses",
      empty: "No unpaid bills or expenses.",
      items: panel.unpaid,
    },
    {
      title: "Bills due in the next 14 days",
      empty: "No bills due in the next 14 days.",
      items: panel.dueSoonBills,
    },
    {
      title: "Missing owner's statements or rates bills",
      empty: "Last month is complete.",
      items: panel.missing,
    },
    {
      title: "Leases expiring within 60 days",
      empty: "No leases expiring within 60 days.",
      items: panel.expiringLeases,
      lease: true,
    },
  ];

  return (
    <section className="grid gap-3" aria-labelledby="attention-heading">
      <div>
        <h2 id="attention-heading" className="text-base font-semibold">
          Needs attention
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open items as of today. Bills due within 14 days are listed on their own.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.title}
            className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{section.title}</h3>
              {section.items.length > 0 ? (
                <Badge variant={section.items.some((item) => item.tone === "overdue") ? "destructive" : "secondary"}>
                  {section.items.length}
                </Badge>
              ) : null}
            </div>
            {section.items.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{section.empty}</p>
            ) : (
              <ul className="mt-3 grid gap-1">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="block rounded-lg px-2 py-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="font-medium">{item.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {item.subtitle}
                        {item.date ? (
                          <>
                            {" · "}
                            <span className={item.tone === "overdue" ? "text-destructive" : undefined}>
                              {section.lease
                                ? daysUntilExpiryLabel(item.date, today)
                                : `due ${formatDateOnly(item.date)}`}
                            </span>
                          </>
                        ) : null}
                        {item.amount ? ` · ${formatZAR(item.amount)}` : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
