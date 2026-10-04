import { useState } from "react";
import { Check, ListChecks, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentMessage, ToolCall } from "@/types/agent";

/** The agent's plan. While pending, the run is paused until the user approves or asks for changes. */
export function PlanCard({
  call,
  result,
  awaiting,
  onApprove,
  onRevise,
}: {
  call: ToolCall;
  result?: Extract<AgentMessage, { role: "tool" }>;
  awaiting: boolean;
  onApprove: () => void;
  onRevise: (feedback: string) => void;
}) {
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");
  const summary = typeof call.args?.summary === "string" ? call.args.summary : "";
  const steps = Array.isArray(call.args?.steps) ? call.args.steps.filter((x): x is string => typeof x === "string") : [];
  const approved = result?.content.startsWith("The user approved");
  const rejected = result?.content.startsWith("The user did NOT");
  const fb = rejected ? /feedback: (.*?)\. Revise/s.exec(result?.content ?? "")?.[1] : null;

  return (
    <section className="rounded-lg border border-primary/40 bg-primary/5 p-4" aria-label="Plan" data-testid="card-plan">
      <div className="flex items-center gap-2">
        <ListChecks className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">Plan</h3>
        {approved ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-primary">
            <Check className="size-3.5" /> Approved
          </span>
        ) : rejected ? (
          <span className="ml-auto text-xs text-muted-foreground">Changes requested</span>
        ) : awaiting ? (
          <span className="ml-auto text-xs font-medium text-warning">Waiting for you</span>
        ) : null}
      </div>
      {summary ? <p className="mt-2 text-sm">{summary}</p> : null}
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {steps.map((st, i) => (
          <li key={i}>{st}</li>
        ))}
      </ol>
      {fb ? (
        <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
          <MessageSquareWarning className="size-3.5 shrink-0" /> “{fb}”
        </p>
      ) : null}
      {awaiting ? (
        revising ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (feedback.trim()) onRevise(feedback.trim());
            }}
          >
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="What should change in the plan?"
              className="w-full rounded-md border bg-background p-3 text-base"
              data-testid="input-plan-feedback"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setRevising(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!feedback.trim()} data-testid="button-send-plan-feedback">
                Send
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setRevising(true)} data-testid="button-revise-plan">
              Change plan
            </Button>
            <Button onClick={onApprove} data-testid="button-approve-plan">
              <Check /> Approve
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}
