'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

/**
 * Project detail page redirect
 * Projects are now accessed via the Clients Portal
 * This page redirects to /clients/[clientId]?project=[projectId]
 */
export default function ProjectRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as Id<"projects">;

  // Fetch the project to get the primary client
  const project = useQuery(api.projects.get, { id: projectId });

  useEffect(() => {
    if (project === undefined) {
      // Still loading
      return;
    }

    if (project === null) {
      // Project not found, redirect to clients
      router.replace('/clients');
      return;
    }

    // Get the first client from clientRoles
    const firstClientRole = project.clientRoles?.[0];
    const clientId = firstClientRole 
      ? ((firstClientRole.clientId as any)?._id || firstClientRole.clientId)
      : null;

    if (clientId) {
      // Redirect to client profile with project context
      router.replace(`/clients/${clientId}?tab=projects&project=${projectId}`);
    } else {
      // No client associated, just go to clients list
      router.replace('/clients');
    }
  }, [project, projectId, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to Client Portal...</p>
        <p className="text-sm text-gray-500 mt-2">
          Projects are now accessible via client profiles
        </p>
      </div>
    </div>
  );
}
