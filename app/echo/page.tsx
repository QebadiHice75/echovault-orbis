import { Suspense } from "react";

import { SharedEcho } from "@/components/shared-echo";

export default function EchoPage() {
  return (
    <Suspense fallback={<main className="shared-page"><div className="shared-missing">Opening Echo…</div></main>}>
      <SharedEcho />
    </Suspense>
  );
}
