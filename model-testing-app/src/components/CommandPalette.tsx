'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import {
  Activity,
  Archive,
  Building,
  Calculator,
  Calendar,
  CalendarClock,
  CheckSquare,
  ContactRound,
  File,
  FileSearch,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Loader2,
  Mail,
  ShieldCheck,
  StickyNote,
  UserSearch,
  Waypoints,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useGlobalSearch } from '@/contexts/GlobalSearchContext';

type SearchResults = FunctionReturnType<typeof api.search.globalSearch>;

const PAGES = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/inbox', label: 'Inbox', icon: Mail },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/filing', label: 'Upload & File', icon: Archive },
  { href: '/clients', label: 'Clients', icon: Building },
  { href: '/prospects', label: 'Prospects', icon: UserSearch },
  { href: '/lenders', label: 'Lenders', icon: Landmark },
  { href: '/rolodex', label: 'Rolodex', icon: ContactRound },
  { href: '/knowledge', label: 'Knowledge', icon: Waypoints },
  { href: '/docs', label: 'Docs', icon: File },
  { href: '/notes', label: 'Notes', icon: FileText },
  { href: '/modeling', label: 'Modeling', icon: Calculator },
];

export default function CommandPalette() {
  const { isOpen, setIsOpen } = useGlobalSearch();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const router = useRouter();

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const data = useQuery(
    api.search.globalSearch,
    debounced.trim() ? { query: debounced } : 'skip'
  );

  // Hold the last non-empty payload so results don't flash away between keystrokes.
  const lastResults = useRef<SearchResults | undefined>(undefined);
  if (data !== undefined) lastResults.current = data;
  const results = debounced.trim() ? (data ?? lastResults.current) : undefined;
  const isLoading = debounced.trim() !== '' && data === undefined;

  const pageMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PAGES;
    return PAGES.filter((p) => p.label.toLowerCase().includes(q));
  }, [search]);

  const go = (href: string) => {
    setIsOpen(false);
    setSearch('');
    router.push(href);
  };

  const hasEntityResults =
    !!results &&
    Object.values(results).some((section) => (section as unknown[]).length > 0);

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setSearch('');
      }}
      title="Global Search"
      description="Search clients, projects, documents, notes, and more"
      className="top-[30%] translate-y-0 sm:max-w-2xl"
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search clients, projects, docs, notes, tasks…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[420px]">
        {isLoading && !results && (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Searching…
          </div>
        )}

        {search.trim() && !isLoading && !hasEntityResults && pageMatches.length === 0 && (
          <CommandEmpty>No results for “{search.trim()}”</CommandEmpty>
        )}

        {results && results.clients.length > 0 && (
          <CommandGroup heading="Clients">
            {results.clients.map((c) => (
              <CommandItem key={c.id} value={`client-${c.id}`} onSelect={() => go(`/clients/${c.id}`)}>
                <Building />
                <span className="truncate">{c.name}</span>
                {c.companyName && c.companyName !== c.name && (
                  <span className="text-muted-foreground truncate text-xs">{c.companyName}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.prospects.length > 0 && (
          <CommandGroup heading="Prospects">
            {results.prospects.map((p) => (
              <CommandItem key={p.id} value={`prospect-${p.id}`} onSelect={() => go(`/prospects/${p.id}`)}>
                <UserSearch />
                <span className="truncate">{p.name}</span>
                {p.prospectState && (
                  <span className="text-muted-foreground text-xs">{p.prospectState.replace(/_/g, ' ')}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.lenders.length > 0 && (
          <CommandGroup heading="Lenders">
            {results.lenders.map((l) => (
              <CommandItem key={l.id} value={`lender-${l.id}`} onSelect={() => go(`/lenders?lenderId=${l.id}`)}>
                <Landmark />
                <span className="truncate">{l.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.projects.length > 0 && (
          <CommandGroup heading="Projects">
            {results.projects.map((p) => (
              <CommandItem key={p.id} value={`project-${p.id}`} onSelect={() => go(`/projects/${p.id}`)}>
                <FolderKanban />
                <span className="truncate">{p.name}</span>
                {p.city && <span className="text-muted-foreground text-xs">{p.city}</span>}
                {p.status && <span className="text-muted-foreground ml-auto text-xs">{p.status}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.documents.length > 0 && (
          <CommandGroup heading="Files">
            {results.documents.map((d) => (
              <CommandItem key={d.id} value={`document-${d.id}`} onSelect={() => go(`/docs/${d.id}`)}>
                <FileText />
                <span className="truncate">{d.fileName}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {d.clientName ?? d.fileTypeDetected}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.docContent.length > 0 && (
          <CommandGroup heading="Document content">
            {results.docContent.map((d) => (
              <CommandItem
                key={d.documentId}
                value={`doc-content-${d.documentId}`}
                onSelect={() => go(`/docs/${d.documentId}`)}
              >
                <FileSearch className="self-start" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {d.fileName}
                    {d.clientName && (
                      <span className="text-muted-foreground text-xs"> · {d.clientName}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground line-clamp-2 text-xs">{d.snippet}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {results.contacts.map((c) => (
              <CommandItem key={c.id} value={`contact-${c.id}`} onSelect={() => go(`/contacts/${c.id}`)}>
                <ContactRound />
                <span className="truncate">{c.name}</span>
                <span className="text-muted-foreground ml-auto truncate text-xs">
                  {c.company ?? c.email ?? c.role}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.notes.length > 0 && (
          <CommandGroup heading="Notes">
            {results.notes.map((n) => (
              <CommandItem key={n.id} value={`note-${n.id}`} onSelect={() => go(`/notes?note=${n.id}`)}>
                {n.emoji ? <span className="w-4 text-center">{n.emoji}</span> : <StickyNote />}
                <span className="truncate">{n.title}</span>
                {n.clientName && (
                  <span className="text-muted-foreground ml-auto truncate text-xs">{n.clientName}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.meetings.length > 0 && (
          <CommandGroup heading="Meetings">
            {results.meetings.map((m) => (
              <CommandItem
                key={m.id}
                value={`meeting-${m.id}`}
                onSelect={() => go(`/clients/${m.clientId}?tab=meetings`)}
              >
                <CalendarClock />
                <span className="truncate">{m.title}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {m.clientName ? `${m.clientName} · ` : ''}
                  {m.meetingDate?.slice(0, 10)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.events.length > 0 && (
          <CommandGroup heading="Calendar">
            {results.events.map((e) => (
              <CommandItem key={e.id} value={`event-${e.id}`} onSelect={() => go('/calendar')}>
                <Calendar />
                <span className="truncate">{e.title}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {e.startTime?.slice(0, 10)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.tasks.length > 0 && (
          <CommandGroup heading="Tasks">
            {results.tasks.map((t) => (
              <CommandItem key={t.id} value={`task-${t.id}`} onSelect={() => go('/tasks')}>
                <CheckSquare />
                <span className="truncate">{t.title}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {t.status.replace(/_/g, ' ')}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.atoms.length > 0 && (
          <CommandGroup heading="Knowledge">
            {results.atoms.map((a) => (
              <CommandItem
                key={a.id}
                value={`atom-${a.id}`}
                onSelect={() =>
                  go(a.clientId ? `/clients/${a.clientId}?tab=intelligence` : '/knowledge')
                }
              >
                <Waypoints className="self-start" />
                <span className="flex min-w-0 flex-col">
                  <span className="line-clamp-2 text-sm">{a.statement}</span>
                  {a.clientName && (
                    <span className="text-muted-foreground text-xs">{a.clientName}</span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {pageMatches.length > 0 && (
          <>
            {hasEntityResults && <CommandSeparator />}
            <CommandGroup heading="Go to">
              {pageMatches.map((p) => (
                <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                  <p.icon />
                  <span>{p.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
