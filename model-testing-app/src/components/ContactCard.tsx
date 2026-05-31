'use client';

import { Contact } from '@/types';
import { Mail, Phone, Building2, Edit2, Trash2 } from 'lucide-react';
import { Panel, IconButton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

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
  const colors = useColors();

  return (
    <Panel
      accent={colors.entityTypes.contact}
      actions={
        <>
          <IconButton label="Edit contact" onClick={onEdit}>
            <Edit2 size={14} />
          </IconButton>
          <IconButton label="Delete contact" onClick={onDelete} style={{ color: colors.accent.red }}>
            <Trash2 size={14} />
          </IconButton>
        </>
      }
      title={contact.name}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {contact.role && (
            <p style={{ fontSize: 12, color: colors.text.secondary }}>{contact.role}</p>
          )}
          {contact.company && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.text.secondary }}>
              <Building2 size={14} style={{ color: colors.text.dim }} />
              <span>{contact.company}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {contact.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Mail size={14} style={{ color: colors.text.dim }} />
              <a href={`mailto:${contact.email}`} style={{ color: colors.accent.blue }}>
                {contact.email}
              </a>
            </div>
          )}
          {contact.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Phone size={14} style={{ color: colors.text.dim }} />
              <a href={`tel:${contact.phone}`} style={{ color: colors.accent.blue }}>
                {contact.phone}
              </a>
            </div>
          )}
        </div>

        {contact.notes && (
          <p
            style={{
              fontSize: 12,
              color: colors.text.secondary,
              paddingTop: 10,
              borderTop: `1px solid ${colors.border.light}`,
            }}
          >
            {contact.notes}
          </p>
        )}

        {showSource && contact.sourceDocumentId && (
          <p style={{ fontSize: 10, color: colors.text.dim }}>
            Source: Document {contact.sourceDocumentId}
          </p>
        )}
      </div>
    </Panel>
  );
}
