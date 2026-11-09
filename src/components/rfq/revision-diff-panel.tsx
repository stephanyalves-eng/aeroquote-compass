import { revisionDiff } from "@/lib/rfq/revision-diff";
import type {
  DocumentRevision,
  ConfigurationSnapshot,
  RevisionAlert,
  ImpactAssessment,
} from "@/lib/rfq/revisions";
import { formatDate } from "@/lib/format";

export function RevisionDiffPanel({
  registry,
  snapshots,
  alert,
  assessments,
}: {
  registry: DocumentRevision[];
  snapshots: readonly ConfigurationSnapshot[];
  alert: RevisionAlert;
  assessments: ImpactAssessment[];
}) {
  const diff = revisionDiff(registry, snapshots, alert, assessments);
  return (
    <details className="border-y border-border-subtle py-3">
      <summary className="min-h-11 cursor-pointer font-medium">
        Revision diff · {diff.previous} → {diff.next}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-sm">
          {diff.kind} {diff.document} · Impact: {diff.impact}
        </p>
        <div className="mobile-data-table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {["Changed field", "Previous revision", "New revision"].map((s) => (
                  <th key={s} className="p-3 text-xs font-medium text-text-secondary">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diff.fields.map((f) => (
                <tr key={f.label} className="border-b border-border-subtle">
                  <td data-label="Changed field" className="p-3 font-medium">
                    {f.label}
                  </td>
                  <td data-label="Previous value" className="p-3">
                    {f.previous}
                  </td>
                  <td data-label="New value" className="p-3">
                    {f.next}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-secondary">{diff.engineeringDetail}</p>
        <div>
          <h4 className="text-sm font-medium">Affected documents</h4>
          <p className="mt-1 break-words text-sm">{diff.documents.join(" · ")}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium">
            Checks requiring re-evaluation ({diff.checks.length})
          </h4>
          <ul className="mt-2 space-y-2 text-sm">
            {diff.checks.map((c) => (
              <li key={c.id}>
                {c.label} · {c.supplier} · {formatDate(c.timestamp)} · Checked Rev {c.previous},
                current Rev {c.next}
                {c.po !== "Not provided" && ` · PO ${c.po}`}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm">Assessment justification: {diff.justification}</p>
      </div>
    </details>
  );
}
