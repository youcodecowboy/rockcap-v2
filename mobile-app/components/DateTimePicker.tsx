import { View, Text, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Clock } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface DateTimePickerProps {
  value?: string; // ISO string or empty
  onChange: (iso: string) => void;
  mode?: 'date' | 'datetime'; // datetime shows time picker too
  minDate?: Date;
  placeholder?: string;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function monthName(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatSummary(iso: string, mode: 'date' | 'datetime'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);

  let datePart: string;
  if (sameDay(d, today)) datePart = 'Today';
  else if (sameDay(d, tomorrow)) datePart = 'Tomorrow';
  else datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });

  if (mode === 'datetime') {
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${timePart}`;
  }
  return datePart;
}

export default function DateTimePicker({ value, onChange, mode = 'date', minDate, placeholder }: DateTimePickerProps) {
  const initialDate = useMemo(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [value]);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(startOfDay(initialDate));
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [hour, setHour] = useState(initialDate.getHours());
  const [minute, setMinute] = useState(initialDate.getMinutes());

  const openPicker = useCallback(() => {
    // Re-sync state from value when opening
    const base = value ? new Date(value) : new Date();
    if (!isNaN(base.getTime())) {
      setSelectedDate(base);
      setViewMonth(startOfDay(base));
      setHour(base.getHours());
      setMinute(base.getMinutes());
    }
    setOpen(true);
  }, [value]);

  const confirm = useCallback(() => {
    const d = new Date(selectedDate);
    if (mode === 'datetime') {
      d.setHours(hour, minute, 0, 0);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    onChange(d.toISOString());
    setOpen(false);
  }, [selectedDate, hour, minute, mode, onChange]);

  // Build calendar grid: 7 cols, up to 6 rows
  const grid = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Monday start
    const numDays = daysInMonth(y, m);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= numDays; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const minD = minDate ? startOfDay(minDate) : null;

  return (
    <>
      <TouchableOpacity onPress={openPicker}>
        <Text className={`text-sm ${value ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
          {value ? formatSummary(value, mode) : (placeholder || 'Select')}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text className="text-base font-semibold text-m-text-primary">
              {mode === 'datetime' ? 'Pick Date & Time' : 'Pick Date'}
            </Text>
            <TouchableOpacity onPress={confirm} hitSlop={8}>
              <Text className="text-sm font-semibold text-m-text-primary">Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {/* Quick options */}
            <View className="flex-row flex-wrap gap-2 mb-4">
              {[
                { label: 'Today', offset: 0 },
                { label: 'Tomorrow', offset: 1 },
                { label: 'In 3 days', offset: 3 },
                { label: 'Next week', offset: 7 },
              ].map((opt) => {
                const d = new Date();
                d.setDate(d.getDate() + opt.offset);
                d.setHours(0, 0, 0, 0);
                const active = sameDay(selectedDate, d);
                return (
                  <TouchableOpacity
                    key={opt.label}
                    onPress={() => {
                      setSelectedDate(d);
                      setViewMonth(d);
                    }}
                    className={`px-3 py-1.5 rounded-full border ${
                      active ? 'bg-m-bg-brand border-m-bg-brand' : 'border-m-border bg-m-bg-card'
                    }`}
                  >
                    <Text className={`text-xs font-medium ${active ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Month nav */}
            <View className="flex-row items-center justify-between bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mb-2">
              <TouchableOpacity onPress={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() - 1); setViewMonth(d); }} hitSlop={8}>
                <ChevronLeft size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text className="text-sm font-semibold text-m-text-primary">{monthName(viewMonth)}</Text>
              <TouchableOpacity onPress={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() + 1); setViewMonth(d); }} hitSlop={8}>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View className="flex-row">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                  <Text className="text-[11px] font-semibold text-m-text-tertiary uppercase">{w}</Text>
                </View>
              ))}
            </View>

            {/* Day grid */}
            <View className="flex-row flex-wrap">
              {grid.map((cell, i) => {
                if (!cell) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                const isSelected = sameDay(cell, selectedDate);
                const isToday = sameDay(cell, today);
                const disabled = minD ? cell < minD : false;
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => !disabled && setSelectedDate(cell)}
                    disabled={disabled}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 }}
                  >
                    <View
                      className={`w-9 h-9 rounded-full items-center justify-center ${
                        isSelected ? 'bg-m-bg-brand' : isToday ? 'bg-m-bg-inset' : ''
                      }`}
                      style={disabled ? { opacity: 0.3 } : undefined}
                    >
                      <Text
                        className={`text-sm ${
                          isSelected ? 'font-semibold text-m-text-on-brand' :
                          isToday ? 'font-semibold text-m-text-primary' :
                          'text-m-text-primary'
                        }`}
                      >
                        {cell.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Time picker */}
            {mode === 'datetime' && (
              <View className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mt-4">
                <View className="flex-row items-center gap-2 mb-3">
                  <Clock size={14} color={colors.textSecondary} />
                  <Text className="text-sm font-medium text-m-text-primary">
                    Time — {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
                  </Text>
                </View>

                {/* Hour selector */}
                <Text className="text-[11px] text-m-text-tertiary uppercase mb-1.5">Hour</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setHour(h)}
                      className={`w-10 h-10 rounded-full items-center justify-center ${hour === h ? 'bg-m-bg-brand' : 'bg-m-bg-subtle'}`}
                    >
                      <Text className={`text-xs font-medium ${hour === h ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                        {String(h).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Minute selector */}
                <Text className="text-[11px] text-m-text-tertiary uppercase mt-3 mb-1.5">Minute</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMinute(m)}
                      className={`w-10 h-10 rounded-full items-center justify-center ${minute === m ? 'bg-m-bg-brand' : 'bg-m-bg-subtle'}`}
                    >
                      <Text className={`text-xs font-medium ${minute === m ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                        {String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </ScrollView>

          {/* Summary bar */}
          <View className="px-4 py-3 border-t border-m-border bg-m-bg-card flex-row items-center justify-between">
            <Text className="text-sm text-m-text-secondary">
              {formatSummary(selectedDate.toISOString(), mode === 'datetime' ? 'datetime' : 'date').replace(/,.*$/, '')}
              {mode === 'datetime' && `, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
            </Text>
            <TouchableOpacity
              onPress={confirm}
              className="bg-m-bg-brand rounded-lg px-4 py-2"
            >
              <Text className="text-sm font-semibold text-m-text-on-brand">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
