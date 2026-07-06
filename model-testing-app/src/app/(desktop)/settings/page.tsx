'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Link2, User, Bell, Shield, ChevronRight, FileText, Tag, History, Calculator, Mic, Mail, Key, HardDrive } from 'lucide-react';
import { useColors } from '@/lib/useColors';

const settingsSections = [
  {
    id: 'hubspot',
    title: 'HubSpot Integration',
    description: 'Sync contacts, companies, and deals from HubSpot',
    icon: Link2,
    href: '/settings/hubspot',
  },
  {
    id: 'fireflies',
    title: 'Fireflies Integration',
    description: 'Connect your Fireflies account to sync meeting transcripts and action items',
    icon: Mic,
    href: '/settings/fireflies',
  },
  {
    id: 'gmail',
    title: 'Gmail Integration',
    description: 'Connect your Gmail account for inbound capture and approval-gated outbound send',
    icon: Mail,
    href: '/settings/gmail',
  },
  {
    id: 'drive',
    title: 'Google Drive Integration',
    description: 'Connect one org-wide Google account to mirror a Drive folder into the app',
    icon: HardDrive,
    href: '/settings/drive',
  },
  {
    id: 'mcp-token',
    title: 'MCP Tokens',
    description: 'Generate per-device tokens so Claude Code on your laptop can connect to the RockCap MCP server',
    icon: Key,
    href: '/settings/mcp-token',
  },
  {
    id: 'file-summary-agent',
    title: 'File Summary Agent',
    description: 'Manage file types and examples for automatic file categorization',
    icon: FileText,
    href: '/settings/file-summary-agent',
  },
  {
    id: 'category-settings',
    title: 'Category Settings',
    description: 'Manage client statuses, types, tags, and prospecting stages',
    icon: Tag,
    href: '/settings/category-settings',
  },
  {
    id: 'changelog',
    title: 'Changelog',
    description: 'View application changes and updates',
    icon: History,
    href: '/settings/changelog',
  },
  {
    id: 'modeling-templates',
    title: 'Modeling Templates',
    description: 'Manage financial model templates',
    icon: Calculator,
    href: '/settings/modeling-templates',
  },
  {
    id: 'modeling-codes',
    title: 'Modeling Code Mappings',
    description: 'Manage category code to input code mappings',
    icon: Calculator,
    href: '/settings/modeling-codes',
  },
  {
    id: 'profile',
    title: 'Profile',
    description: 'Manage your account settings and preferences',
    icon: User,
    href: '/settings/profile',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Configure email and in-app notifications',
    icon: Bell,
    href: '/settings/notifications',
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Manage passwords and security settings',
    icon: Shield,
    href: '/settings/security',
  },
];

export default function SettingsPage() {
  const pathname = usePathname();
  const colors = useColors();

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center gap-3">
          <Settings style={{ width: 22, height: 22, color: colors.text.muted }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary }}>Settings</h1>
            <p style={{ marginTop: 4, fontSize: 12, color: colors.text.muted }}>
              Manage your account settings and integrations
            </p>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-2">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const isActive = pathname === section.href || pathname.startsWith(section.href + '/');
            const accent = isActive ? colors.accent.blue : undefined;

            return (
              <Link key={section.id} href={section.href} style={{ display: 'block', textDecoration: 'none' }}>
                <SettingsRow Icon={Icon} title={section.title} description={section.description} accent={accent} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsRow({
  Icon,
  title,
  description,
  accent,
}: {
  Icon: typeof Settings;
  title: string;
  description: string;
  accent?: string;
}) {
  const colors = useColors();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '14px 16px',
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderLeft: accent ? `2px solid ${accent}` : `1px solid ${colors.border.default}`,
        borderRadius: 4,
        transition: 'border-color 100ms linear, background 100ms linear',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg.cardAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = colors.bg.card)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 4,
            background: accent ? `${accent}15` : colors.bg.cardAlt,
            border: `1px solid ${accent ? `${accent}40` : colors.border.light}`,
          }}
        >
          <Icon style={{ width: 18, height: 18, color: accent ?? colors.text.muted }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{title}</div>
          <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{description}</div>
        </div>
      </div>
      <ChevronRight style={{ width: 16, height: 16, color: colors.text.dim }} />
    </div>
  );
}
