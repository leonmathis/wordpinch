import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RoomNotFound() {
  return (
    <div className="wp-root">
      <div className="wp-chrome">
        <div className="wp-brand">wordpinch</div>
        <div />
      </div>
      <div className="wp-body">
        <div className="wp-frame scene text-center">
          <div className="t-label-up">404</div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              margin: 0,
              marginTop: 6,
            }}
          >
            Room not found
          </h1>
          <p
            className="text-muted-foreground mx-auto"
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              maxWidth: "40ch",
              marginTop: 16,
            }}
          >
            That room code doesn&rsquo;t exist or has expired. Start a new game
            from the landing page.
          </p>
          <Link
            href="/"
            className={cn(
              buttonVariants(),
              "mt-7 h-[38px] rounded-[var(--radius)] text-[14px] inline-flex"
            )}
          >
            Back to landing
          </Link>
        </div>
      </div>
    </div>
  );
}
