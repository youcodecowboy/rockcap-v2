'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Link2, User, Bell, Shield, ChevronRight, FileText, Tag, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const settingsSections = [
  {
    id: 'hubspot',
    title: 'HubSpot Integration',
    description: 'Sync contacts, companies, and deals from HubSpot',
    icon: Link2,
    href: '/settings/hubspot',
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

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your account settings and integrations
          </p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-4">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const isActive = pathname === section.href || pathname.startsWith(section.href + '/');
            
            return (
              <Link key={section.id} href={section.href}>
                <Card className={`cursor-pointer transition-all hover:shadow-md ${
                  isActive ? 'ring-2 ring-blue-500' : ''
                }`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-lg ${
                          isActive ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <Icon className={`w-6 h-6 ${
                            isActive ? 'text-blue-600' : 'text-gray-600'
                          }`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{section.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {section.description}
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

