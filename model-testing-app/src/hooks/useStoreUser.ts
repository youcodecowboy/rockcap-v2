"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Hook to sync Clerk user to Convex database
 * Call this in your root layout or a top-level component
 */
export function useStoreUser() {
  const { user, isLoaded } = useUser();
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    // Only sync if Clerk has loaded and user is signed in
    if (!isLoaded || !user) return;

    // Sync user to Convex
    const syncUser = async () => {
      try {
        await storeUser({
          clerkId: user.id,
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || undefined,
          image: user.imageUrl || undefined,
        });
      } catch (error) {
        console.error("Failed to sync user to Convex:", error);
      }
    };

    syncUser();
  }, [isLoaded, user, storeUser]);
}

