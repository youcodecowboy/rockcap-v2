'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Mail,
  Phone,
  Copy,
  Check,
  MoreVertical,
  Pencil,
  Trash2,
  User,
  Building2,
  MessageSquare,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Contact {
  _id: Id<"contacts">;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdAt: string;
}

interface ClientContactsTabProps {
  clientId: Id<"clients">;
  clientName: string;
  contacts: Contact[];
}

export default function ClientContactsTab({
  clientId,
  clientName,
  contacts,
}: ClientContactsTabProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (error) {
      console.error('Failed to copy email:', error);
    }
  };

  const handleDelete = async (contactId: Id<"contacts">) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    setIsDeleting(contactId);
    try {
      await removeContact({ id: contactId });
    } catch (error) {
      console.error('Failed to delete contact:', error);
      alert('Failed to delete contact. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Contacts</h2>
          <p className="text-sm text-gray-500">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} for {clientName}
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Contact
        </Button>
      </div>

      {/* Contact Cards Grid */}
      {contacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <ContactCard
              key={contact._id}
              contact={contact}
              onEdit={() => setEditingContact(contact)}
              onDelete={() => handleDelete(contact._id)}
              onCopyEmail={handleCopyEmail}
              copiedEmail={copiedEmail}
              isDeleting={isDeleting === contact._id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Add your first contact to start building your network
          </p>
          <Button onClick={() => setIsAddModalOpen(true)} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            Add Contact
          </Button>
        </div>
      )}

      {/* Add/Edit Modal */}
      <ContactModal
        isOpen={isAddModalOpen || editingContact !== null}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingContact(null);
        }}
        contact={editingContact}
        clientId={clientId}
        onSave={async (data) => {
          if (editingContact) {
            await updateContact({ id: editingContact._id, ...data });
          } else {
            await createContact({ ...data, clientId });
          }
        }}
      />
    </div>
  );
}

// Contact Card Component
function ContactCard({
  contact,
  onEdit,
  onDelete,
  onCopyEmail,
  copiedEmail,
  isDeleting,
}: {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
  onCopyEmail: (email: string) => void;
  copiedEmail: string | null;
  isDeleting: boolean;
}) {
  const initials = contact.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
            {initials}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{contact.name}</h3>
            {contact.role && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {contact.role}
              </p>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onDelete} 
              className="text-red-600"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Contact Info */}
      <div className="space-y-2 mb-4">
        {contact.email && (
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="truncate">{contact.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopyEmail(contact.email!)}
            >
              {copiedEmail === contact.email ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Phone className="w-4 h-4 text-gray-400" />
            <span>{contact.phone}</span>
          </div>
        )}
        {contact.company && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 className="w-4 h-4 text-gray-400" />
            <span>{contact.company}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {contact.notes && (
        <div className="bg-gray-50 rounded-md p-3 mb-4">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Notes
          </p>
          <p className="text-sm text-gray-700 line-clamp-2">{contact.notes}</p>
        </div>
      )}

      {/* Action Button */}
      <Button 
        variant="outline" 
        className="w-full gap-2"
        onClick={() => {
          if (contact.email) {
            window.location.href = `mailto:${contact.email}`;
          }
        }}
        disabled={!contact.email}
      >
        <Mail className="w-4 h-4" />
        Contact Person
      </Button>
    </div>
  );
}

// Contact Modal Component
function ContactModal({
  isOpen,
  onClose,
  contact,
  clientId,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  clientId: Id<"clients">;
  onSave: (data: {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens with a contact
  useState(() => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        role: contact.role || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        notes: contact.notes || '',
      });
    } else {
      setFormData({
        name: '',
        role: '',
        email: '',
        phone: '',
        company: '',
        notes: '',
      });
    }
  });

  // Update form when contact changes
  const handleOpen = () => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        role: contact.role || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        notes: contact.notes || '',
      });
    } else {
      setFormData({
        name: '',
        role: '',
        email: '',
        phone: '',
        company: '',
        notes: '',
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        company: formData.company.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
      onClose();
      setFormData({ name: '', role: '', email: '', phone: '', company: '', notes: '' });
    } catch (error) {
      console.error('Failed to save contact:', error);
      alert('Failed to save contact. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (open) {
        handleOpen();
      } else {
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {contact ? 'Edit Contact' : 'Add New Contact'}
          </DialogTitle>
          <DialogDescription>
            {contact ? 'Update the contact information below.' : 'Add a new contact to your client.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="John Smith"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Role</label>
              <Input
                placeholder="CEO, Manager, etc."
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <Input
                placeholder="+44 7XXX XXXXXX"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Company</label>
            <Input
              placeholder="Company name"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <Textarea
              placeholder="Any additional notes about this contact..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : contact ? 'Save Changes' : 'Add Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
