import { AlertTriangle, ArrowRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OperationItem } from "@/lib/rfq/operations";

export function OperationalPanel({
  items,
  onSelect,
  compact = false,
}: {
  items: OperationItem[];
  onSelect: (step: number) => void;
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Operational dashboard"
      className="space-y-4 border-y border-border-default py-5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ClipboardList className="size-5 shrink-0 text-text-secondary" />
        <h3 className="min-w-0 text-lg font-medium">Operational dashboard</h3>
      </div>
      <p className="text-xs text-text-secondary">
        Current RFQ · {compact ? "Saved snapshot" : "Live workspace"}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.id} className="min-w-0 space-y-3 border-l-2 border-border-default pl-3">
            <p className="text-xs text-text-secondary">{item.label}</p>
            <p
              className={`flex items-center gap-2 text-2xl font-medium ${item.tone === "error" ? "text-error" : item.tone === "warning" ? "text-warning" : "text-text-primary"}`}
            >
              {item.count}
              {item.count > 0 && <AlertTriangle className="size-4 shrink-0" />}
            </p>
            {item.details.length > 0 && (
              <details>
                <summary className="min-h-11 cursor-pointer text-sm">View attention items</summary>
                <ul className="space-y-2 break-words text-xs text-text-secondary">
                  {item.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
            <Button
              variant="ghost"
              className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left"
              onClick={() => onSelect(item.step)}
            >
              {item.action}
              <ArrowRight className="shrink-0" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
