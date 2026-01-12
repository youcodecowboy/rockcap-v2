'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Building } from 'lucide-react';
import ClientsSidebar from './components/ClientsSidebar';
import CreateClientDrawer from '@/components/CreateClientDrawer';

function ClientsPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get selected client from URL or state
  const urlClientId = searchParams.get('client') as Id<"clients"> | null;
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | null>(urlClientId);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);

  // Fetch selected client details
  const selectedClient = useQuery(
    api.clients.get,
    selectedClientId ? { id: selectedClientId } : "skip"
  );

  // Handler for client selection
  const handleClientSelect = useCallback((clientId: Id<"clients"> | null) => {
    setSelectedClientId(clientId);
    if (clientId) {
      // Navigate to the client profile page
      router.push(`/clients/${clientId}`);
    }
  }, [router]);

  const handleAddClient = useCallback(() => {
    setIsCreateDrawerOpen(true);
  }, []);

  const handleClientCreated = useCallback(() => {
    setIsCreateDrawerOpen(false);
    // Navigation is handled by CreateClientDrawer
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Clients Portal</h1>
            <p className="text-sm text-gray-500">Manage clients, projects, and documents</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ClientsSidebar
          selectedClientId={selectedClientId}
          onClientSelect={handleClientSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onAddClient={handleAddClient}
        />

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          {!selectedClientId ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building className="w-8 h-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Select a Client
                </h2>
                <p className="text-gray-500 mb-6">
                  Choose a client from the sidebar to view their profile, projects, documents, and more.
                </p>
                <button
                  onClick={handleAddClient}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Building className="w-4 h-4" />
                  Create New Client
                </button>
              </div>
            </div>
          ) : selectedClient === undefined ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedClient === null ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-500">Client not found</p>
              </div>
            </div>
          ) : (
            // Redirect to client profile page
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading {selectedClient.name}...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Client Drawer */}
      <CreateClientDrawer
        isOpen={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
        onSuccess={handleClientCreated}
      />
    </div>
  );
}

// Loading fallback component
function ClientsPortalLoading() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Loading Clients Portal...</p>
      </div>
    </div>
  );
}

// Main export with Suspense boundary
export default function ClientsPortalPage() {
  return (
    <Suspense fallback={<ClientsPortalLoading />}>
      <ClientsPortalContent />
    </Suspense>
  );
}
