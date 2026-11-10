import type { ReactNode } from "react";
/** Status tag: red = blocker, amber = review / re-evaluation, green = confirmed / current, gray = superseded or informational. Always paired with a word. */
export type Tone = "error" | "warning" | "success" | "neutral";
const CLS: Record<Tone, string> = { error: "bg-error-bg text-error", warning: "bg-warning-bg text-warning-tag", success: "bg-success-bg text-success-tag", neutral: "bg-surface-sunken text-text-tertiary" };
export function Tag({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex max-w-full rounded-sm px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${CLS[tone]}`}>{children}</span>;
}
export const toneFor = (s: string): Tone => /block|not eligible|not provided|missing|divergen|insufficient|error/i.test(s) ? "error" : /review|caveat|await|requires|held|medium|new revision|re-evaluation|analysis|undetected/i.test(s) ? "warning" : /confirm|eligible|current|valid|released|low|no known/i.test(s) ? "success" : "neutral";
export const th = "sticky top-0 z-10 bg-surface-sunken px-3 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary";
export const td = "border-t border-border-subtle px-3 py-2 align-top";
