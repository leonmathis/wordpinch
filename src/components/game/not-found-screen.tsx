"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useStoredBool } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Shape } from "./kit/shape";
import { TopChrome } from "./top-chrome";

type Props = { title: string; body: string };

/** Pastel Pop 404, shared by the root and the room routes. */
export function NotFoundScreen({ title, body }: Props) {
  const [muted, setMuted] = useStoredBool("muted");
  return (
    <div className="wp-root" data-phase="landing">
      <TopChrome total={0} muted={muted} onToggleMute={() => setMuted(!muted)} />
      <div className="wp-body">
        <div className="wp-frame flex flex-col items-center text-center">
          <Shape kind="star" size={180} fill="var(--shape-pink)">
            <span className="font-hand text-[42px] leading-none">404</span>
          </Shape>
          <h1 className="mt-5 mb-0 text-[32px] leading-[1.05] font-extrabold tracking-[-0.02em] lg:text-[40px]">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-[36ch] text-[15px] leading-[1.6] font-medium text-muted-foreground">
            {body}
          </p>
          <Link href="/" className={cn(buttonVariants({ variant: "pill", size: "pill-lg" }), "mt-7 px-8")}>
            Back to start
          </Link>
        </div>
      </div>
    </div>
  );
}
