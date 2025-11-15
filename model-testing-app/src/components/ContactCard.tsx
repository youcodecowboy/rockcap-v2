'use client';

import { Contact } from '@/types';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Building2, Edit2, Trash2 } from 'lucide-react';

interface ContactCardProps {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
  showSource?: boolean;
}

export default function ContactCard({
  contact,
  onEdit,
  onDelete,
  showSource = false,
}: ContactCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{contact.name}</h3>
          {contact.role && (
            <p className="text-sm text-gray-600 mb-2">{contact.role}</p>
          )}
          {contact.company && (
            <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
              <Building2 className="w-4 h-4" />
              <span>{contact.company}</span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 w-8 p-0"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {contact.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Mail className="w-4 h-4 text-gray-400" />
            <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
              {contact.email}
            </a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone className="w-4 h-4 text-gray-400" />
            <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">
              {contact.phone}
            </a>
          </div>
        )}
      </div>

      {contact.notes && (
        <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-100">
          {contact.notes}
        </p>
      )}

      {showSource && contact.sourceDocumentId && (
        <p className="text-xs text-gray-400 mt-2">
          Source: Document {contact.sourceDocumentId}
        </p>
      )}
    </div>
  );
}

