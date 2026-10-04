import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";

export default function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        title="Page not found"
        action={
          <Button asChild variant="secondary">
            <Link href="/">Go home</Link>
          </Button>
        }
      >
        That route doesn't exist in Mobile Development AI.
      </EmptyState>
    </div>
  );
}
