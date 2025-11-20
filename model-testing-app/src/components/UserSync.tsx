"use client";

import { useStoreUser } from "@/hooks/useStoreUser";

export function UserSync() {
  useStoreUser();
  return null;
}

