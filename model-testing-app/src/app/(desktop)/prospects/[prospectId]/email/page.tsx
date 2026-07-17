"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// RETIRED (2026-06). The standalone localStorage email composer that lived here
// is dead code — outreach is composed + edited inline on the prospect detail
// Outreach tab (cadences.update for pre-fire touches, approvals.updateDraft for
// staged ones). This route now just redirects to the prospect so any lingering
// link (e.g. an old templates returnUrl) lands on the real surface.
export default function RetiredEmailComposerRedirect() {
  const router = useRouter();
  const params = useParams();
  const prospectId = params.prospectId as string;

  useEffect(() => {
    router.replace(prospectId ? `/prospects/${prospectId}` : "/prospects");
  }, [router, prospectId]);

  return null;
}
