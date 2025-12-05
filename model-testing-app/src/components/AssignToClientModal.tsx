'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Building2, UserPlus } from 'lucide-react';

interface AssignToClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  projectName: string;
  onSuccess?: () => void;
}

export function AssignToClientModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  onSuccess,
}: AssignToClientModalProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('borrower');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clients = useQuery(api.clients.list, {});
  const updateProject = useMutation(api.projects.update);

  // Filter clients by search query
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!searchQuery.trim()) return clients;
    
    const query = searchQuery.toLowerCase();
    return clients.filter(client => 
      client.name.toLowerCase().includes(query) ||
      client.companyName?.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  const handleSubmit = async () => {
    if (!selectedClientId) return;
    
    setIsSubmitting(true);
    try {
      await updateProject({
        id: projectId,
        clientRoles: [{
          clientId: selectedClientId as Id<"clients">,
          role: selectedRole,
        }],
      });
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to assign project to client:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedClientId('');
    setSelectedRole('borrower');
    setSearchQuery('');
    onClose();
  };

  const roleOptions = [
    { value: 'borrower', label: 'Borrower' },
    { value: 'lender', label: 'Lender' },
    { value: 'developer', label: 'Developer' },
    { value: 'investor', label: 'Investor' },
    { value: 'partner', label: 'Partner' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            Assign to Client
          </DialogTitle>
          <DialogDescription>
            Assign <span className="font-medium text-gray-900">{projectName}</span> to a client for better organization and tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Select Client</Label>
            <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {!clients ? (
                <div className="p-3 text-sm text-gray-500 text-center">Loading clients...</div>
              ) : filteredClients.length === 0 ? (
                <div className="p-3 text-sm text-gray-500 text-center">
                  {searchQuery ? 'No clients found matching your search' : 'No clients available'}
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client._id}
                    onClick={() => setSelectedClientId(client._id)}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                      selectedClientId === client._id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedClientId === client._id ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <Building2 className={`w-4 h-4 ${
                        selectedClientId === client._id ? 'text-blue-600' : 'text-gray-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${
                        selectedClientId === client._id ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {client.name}
                      </div>
                      {client.companyName && client.companyName !== client.name && (
                        <div className="text-xs text-gray-500 truncate">{client.companyName}</div>
                      )}
                    </div>
                    {selectedClientId === client._id && (
                      <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label>Client Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              The role describes the client&apos;s relationship to this project
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!selectedClientId || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? 'Assigning...' : 'Assign to Client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

