import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, Linking,
  ActivityIndicator,
} from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import {
  ArrowLeft, Search, X, Plus, Phone, Mail, Users, ChevronRight, Building,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';
import ContactAvatar from '@/components/contacts/ContactAvatar';
import ContactCreateModal from '@/components/contacts/ContactCreateModal';
import ContactDetailModal from '@/components/contacts/ContactDetailModal';

// ---------------------------------------------------------------------------
// Contact book screen
//
// Layout (top → bottom):
//   MobileHeader
//   Sub-header (back + title + count)
//   Search bar
//   Client filter chips (horizontal scroll — "All" + clients that have contacts)
//   Alphabetical grouped list
//   FAB "New Contact" (bottom-right)
//
// Tapping a contact row opens ContactDetailModal. FAB opens
// ContactCreateModal. Both are full-screen Modals — no stack route churn.
// ---------------------------------------------------------------------------

// Helpers for alphabetical grouping. Kept inline so this screen is fully
// self-contained; extract later if we add contact grouping elsewhere.
interface ContactGroup {
  letter: string;
  contacts: any[];
}

function groupContactsByLetter(contacts: any[]): ContactGroup[] {
  const sorted = [...contacts].sort((a, b) =>
    a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }),
  );
  const groups = new Map<string, any[]>();
  for (const c of sorted) {
    const first = c.name.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(c);
  }
  return Array.from(groups.entries()).map(([letter, contacts]) => ({
    letter,
    contacts,
  }));
}

export default function ContactsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();

  // Deep-link params:
  //   ?clientId=X     — pre-select the client filter chip
  //   ?contactId=X    — auto-open the detail modal for this contact
  // Both are useful when navigating from the client detail's Key Contacts,
  // where "Contact A" should open the detail and "View all" should filter
  // the list to that client.
  const params = useLocalSearchParams<{
    clientId?: string;
    contactId?: string;
  }>();

  const contacts = useQuery(api.contacts.getAll, isAuthenticated ? {} : 'skip');
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');

  const [search, setSearch] = useState('');
  const [activeClientFilter, setActiveClientFilter] = useState<string | null>(
    params.clientId ?? null,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [openContactId, setOpenContactId] = useState<string | null>(
    params.contactId ?? null,
  );

  // If the user navigates here with a new `contactId` while the screen is
  // already mounted (e.g. from two different client detail pages in the
  // stack), re-open the right modal. React to param changes with an effect.
  useEffect(() => {
    if (params.contactId && params.contactId !== openContactId) {
      setOpenContactId(params.contactId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.contactId]);

  useEffect(() => {
    if (params.clientId && params.clientId !== activeClientFilter) {
      setActiveClientFilter(params.clientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.clientId]);

  // Map client IDs → names for quick lookup in the list
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    (clients || []).forEach((c: any) => map.set(c._id, c.name));
    return map;
  }, [clients]);

  // Only show client filter chips for clients that actually have contacts.
  const clientsWithContacts = useMemo(() => {
    if (!contacts || !clients) return [];
    const ids = new Set<string>();
    for (const c of contacts) {
      if (c.clientId) ids.add(c.clientId);
    }
    return (clients || [])
      .filter((c: any) => ids.has(c._id))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [contacts, clients]);

  const filtered = useMemo(() => {
    if (!contacts) return [];
    let list = contacts;
    if (activeClientFilter) {
      list = list.filter((c: any) => c.clientId === activeClientFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c: any) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.role && c.role.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [contacts, activeClientFilter, search]);

  const groups = useMemo(() => groupContactsByLetter(filtered), [filtered]);

  // Flatten groups into FlatList rows. Each group produces a section header
  // row followed by its contact rows. This is the standard RN idiom — keep
  // one FlatList, use renderItem to discriminate row types.
  type Row =
    | { kind: 'header'; letter: string }
    | { kind: 'contact'; contact: any };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of groups) {
      out.push({ kind: 'header', letter: g.letter });
      for (const c of g.contacts) out.push({ kind: 'contact', contact: c });
    }
    return out;
  }, [groups]);

  const isLoading = contacts === undefined;
  const hasAnyContacts = (contacts?.length ?? 0) > 0;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-header */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <ArrowLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-[15px] font-medium text-m-text-primary">
            Contacts
          </Text>
          {!isLoading && hasAnyContacts ? (
            <Text className="text-[11px] text-m-text-tertiary">
              {filtered.length} of {contacts?.length ?? 0}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          className="p-1 -mr-1"
          hitSlop={8}
        >
          <Plus size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2 px-3 py-2 rounded-[10px] bg-m-bg-subtle border border-m-border">
          <Search size={14} color={colors.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts..."
            placeholderTextColor={colors.textTertiary}
            className="flex-1 text-sm text-m-text-primary py-0"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <X size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Client filter chips */}
      {clientsWithContacts.length > 0 && (
        <View className="pb-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          >
            <FilterChip
              label="All"
              active={activeClientFilter === null}
              onPress={() => setActiveClientFilter(null)}
            />
            {clientsWithContacts.map((c: any) => (
              <FilterChip
                key={c._id}
                label={c.name}
                active={activeClientFilter === c._id}
                onPress={() =>
                  setActiveClientFilter(
                    activeClientFilter === c._id ? null : c._id,
                  )
                }
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      ) : !hasAnyContacts ? (
        <EmptyState
          title="No contacts yet"
          subtitle="Add solicitors, surveyors, brokers, and other people you work with"
          ctaLabel="Add your first contact"
          onCta={() => setShowCreate(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          subtitle={
            search
              ? `Nothing matches "${search.trim()}"`
              : 'Try clearing the client filter'
          }
          ctaLabel="Clear filters"
          onCta={() => {
            setSearch('');
            setActiveClientFilter(null);
          }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, idx) =>
            row.kind === 'header' ? `hdr-${row.letter}` : row.contact._id
          }
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View className="bg-m-bg-subtle/50 px-4 py-1.5 border-b border-m-border-subtle">
                  <Text className="text-[11px] font-bold text-m-accent uppercase tracking-wider">
                    {item.letter}
                  </Text>
                </View>
              );
            }
            const c = item.contact;
            const clientName = c.clientId ? clientMap.get(c.clientId) : undefined;
            return (
              <ContactRow
                contact={c}
                clientName={clientName}
                onPress={() => setOpenContactId(c._id)}
              />
            );
          }}
        />
      )}

      {/* FAB */}
      {hasAnyContacts && (
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          className="absolute bottom-6 right-4 flex-row items-center rounded-full px-4 py-3 shadow-lg"
          style={{
            backgroundColor: colors.bgBrand,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 6,
            gap: 6,
          }}
          hitSlop={6}
        >
          <Plus size={16} color={colors.textOnBrand} />
          <Text className="text-sm font-semibold" style={{ color: colors.textOnBrand }}>
            New Contact
          </Text>
        </TouchableOpacity>
      )}

      {/* Modals */}
      <ContactCreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
      />
      <ContactDetailModal
        visible={openContactId !== null}
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function FilterChip({
  label, active, onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="rounded-full px-3 py-1.5"
      style={{
        backgroundColor: active ? colors.bgBrand : colors.bgSubtle,
        borderWidth: 1,
        borderColor: active ? colors.bgBrand : colors.border,
      }}
    >
      <Text
        className="text-[12px] font-medium"
        numberOfLines={1}
        style={{ color: active ? colors.textOnBrand : colors.textSecondary }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ContactRow({
  contact, clientName, onPress,
}: {
  contact: any;
  clientName?: string;
  onPress: () => void;
}) {
  // Row layout: outer View contains TWO siblings — a flex-1 TouchableOpacity
  // that covers the avatar + name/subtitle block, and a flat View with the
  // inline action buttons. This means:
  //   - Tapping anywhere on the avatar/text area opens the detail modal
  //   - Tapping a Call or Email button ONLY fires that button's onPress
  //   - No `stopPropagation` needed — siblings don't bubble to each other
  //
  // Previous implementation nested Touchables and used `e.stopPropagation?.()`
  // which worked on native but was fragile on react-native-web where the
  // event shape can differ. Sibling layout is bulletproof cross-platform.
  return (
    <View className="flex-row items-center border-b border-m-border-subtle">
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.6}
        className="flex-1 flex-row items-center gap-3 px-4 py-3"
      >
        <ContactAvatar name={contact.name} size={36} />
        <View className="flex-1 min-w-0">
          <Text
            className="text-[14px] font-medium text-m-text-primary"
            numberOfLines={1}
          >
            {contact.name}
          </Text>
          <View className="flex-row items-center gap-1 mt-0.5">
            {contact.role ? (
              <Text
                className="text-[11px] text-m-text-tertiary"
                numberOfLines={1}
              >
                {contact.role}
                {clientName ? ` · ${clientName}` : ''}
              </Text>
            ) : clientName ? (
              <View className="flex-row items-center gap-0.5">
                <Building size={10} color={colors.accent} />
                <Text
                  className="text-[11px] text-m-accent"
                  numberOfLines={1}
                >
                  {clientName}
                </Text>
              </View>
            ) : contact.email ? (
              <Text
                className="text-[11px] text-m-text-tertiary"
                numberOfLines={1}
              >
                {contact.email}
              </Text>
            ) : (
              <Text className="text-[11px] text-m-text-tertiary italic">
                No details
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Inline quick actions — genuinely outside the main tap area.
          Own padding/margin so hit targets are the same ~36px they were before. */}
      <View className="flex-row items-center gap-1 pr-4 pl-1 py-3">
        {contact.phone ? (
          <TouchableOpacity
            onPress={() => {
              Linking.openURL(`tel:${contact.phone}`).catch(() => {});
            }}
            hitSlop={6}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.bgSubtle }}
          >
            <Phone size={13} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
        {contact.email ? (
          <TouchableOpacity
            onPress={() => {
              Linking.openURL(`mailto:${contact.email}`).catch(() => {});
            }}
            hitSlop={6}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.bgSubtle }}
          >
            <Mail size={13} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
        <ChevronRight size={14} color={colors.textTertiary} />
      </View>
    </View>
  );
}

function EmptyState({
  title, subtitle, ctaLabel, onCta,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View
        className="w-14 h-14 rounded-full items-center justify-center mb-3"
        style={{ backgroundColor: colors.bgSubtle }}
      >
        <Users size={22} color={colors.textTertiary} />
      </View>
      <Text className="text-base font-semibold text-m-text-primary text-center">
        {title}
      </Text>
      <Text className="text-sm text-m-text-tertiary text-center mt-1">
        {subtitle}
      </Text>
      <TouchableOpacity
        onPress={onCta}
        className="mt-4 px-4 py-2.5 rounded-[10px]"
        style={{ backgroundColor: colors.bgBrand }}
      >
        <Text className="text-sm font-medium" style={{ color: colors.textOnBrand }}>
          {ctaLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
