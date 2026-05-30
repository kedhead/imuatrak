import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { EventType } from "@/models/club";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import { bulkCreateEvents } from "@/services/clubService";
import { Button } from "@/ui/Button";
import { colors, radii, spacing, type } from "@/ui/theme";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATIONS = [30, 45, 60, 90, 120];
const EVENT_TYPES: EventType[] = ["practice", "race", "social"];

function fmt12(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function BulkScheduleScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);

  const defaultTime = () => { const d = new Date(); d.setHours(7, 0, 0, 0); return d; };
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([2, 4, 6]));
  const [dayTimes, setDayTimes] = useState<Map<number, Date>>(() => {
    const m = new Map<number, Date>();
    [2, 4, 6].forEach((d) => m.set(d, defaultTime()));
    return m;
  });

  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); d.setHours(0, 0, 0, 0); return d;
  });

  const [durationMinutes, setDurationMinutes] = useState(90);
  const [eventType, setEventType] = useState<EventType>("practice");
  const [title, setTitle] = useState("Morning Practice");
  const [location, setLocation] = useState("");

  const [activeDayPicker, setActiveDayPicker] = useState<number | null>(null);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);

  const [busy, setBusy] = useState(false);

  const previewCount = useMemo(() => {
    let count = 0;
    const cur = new Date(rangeStart);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(23, 59, 59, 999);
    while (cur <= end) {
      if (selectedDays.has(cur.getDay())) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [selectedDays, rangeStart, rangeEnd]);

  const toggleDay = (dow: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) {
        next.delete(dow);
      } else {
        next.add(dow);
        if (!dayTimes.has(dow)) {
          setDayTimes((m) => new Map(m).set(dow, defaultTime()));
        }
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (selectedDays.size === 0) { Alert.alert("Select at least one day"); return; }
    if (!title.trim()) { Alert.alert("Enter a title"); return; }
    if (!club) return;
    const user = currentUser();
    if (!user) return;

    setBusy(true);
    try {
      const schedule = Array.from(selectedDays).map((dow) => {
        const t = dayTimes.get(dow) ?? defaultTime();
        return { dayOfWeek: dow, startHour: t.getHours(), startMinute: t.getMinutes() };
      });
      const count = await bulkCreateEvents(club.id, user.uid, {
        title: title.trim(),
        type: eventType,
        schedule,
        durationMinutes,
        rangeStart,
        rangeEnd,
        location: location.trim() || undefined,
      });
      Alert.alert("Done!", `Created ${count} event${count !== 1 ? "s" : ""}.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!club || (role !== "owner" && role !== "admin" && role !== "coach")) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Admin access required</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Event type */}
        <Text style={styles.label}>EVENT TYPE</Text>
        <View style={styles.pills}>
          {EVENT_TYPES.map((t) => (
            <Pressable
              key={t}
              style={[styles.pill, eventType === t && styles.pillActive]}
              onPress={() => setEventType(t)}
            >
              <Text style={[styles.pillText, eventType === t && styles.pillTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Title */}
        <Text style={styles.label}>TITLE</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Morning Practice"
          placeholderTextColor={colors.muted}
        />

        {/* Location */}
        <Text style={styles.label}>LOCATION (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Keehi Lagoon"
          placeholderTextColor={colors.muted}
        />

        {/* Days */}
        <Text style={styles.label}>DAYS OF WEEK</Text>
        <View style={styles.pills}>
          {DAY_NAMES.map((name, dow) => (
            <Pressable
              key={dow}
              style={[styles.pill, selectedDays.has(dow) && styles.pillActive]}
              onPress={() => toggleDay(dow)}
            >
              <Text style={[styles.pillText, selectedDays.has(dow) && styles.pillTextActive]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Per-day times */}
        {Array.from(selectedDays).sort().map((dow) => (
          <View key={dow} style={styles.dayTimeRow}>
            <Text style={styles.dayName}>{DAY_NAMES[dow]}</Text>
            <Pressable
              style={styles.timeBtn}
              onPress={() => setActiveDayPicker(activeDayPicker === dow ? null : dow)}
            >
              <Text style={styles.timeBtnText}>{fmt12(dayTimes.get(dow) ?? defaultTime())}</Text>
            </Pressable>
          </View>
        ))}

        {activeDayPicker !== null && (
          <DateTimePicker
            value={dayTimes.get(activeDayPicker) ?? defaultTime()}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, d) => {
              if (Platform.OS !== "ios") setActiveDayPicker(null);
              if (d) setDayTimes((m) => new Map(m).set(activeDayPicker!, d));
            }}
          />
        )}

        {/* Duration */}
        <Text style={styles.label}>DURATION</Text>
        <View style={styles.pills}>
          {DURATIONS.map((min) => (
            <Pressable
              key={min}
              style={[styles.pill, durationMinutes === min && styles.pillActive]}
              onPress={() => setDurationMinutes(min)}
            >
              <Text style={[styles.pillText, durationMinutes === min && styles.pillTextActive]}>
                {min >= 60 ? `${min / 60}h` : `${min}m`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date range */}
        <Text style={styles.label}>DATE RANGE</Text>
        <View style={styles.dateRange}>
          <Pressable style={styles.dateBtn} onPress={() => { setShowEndDate(false); setShowStartDate(true); }}>
            <Text style={styles.dateBtnLabel}>From</Text>
            <Text style={styles.dateBtnValue}>{fmtDate(rangeStart)}</Text>
          </Pressable>
          <Text style={styles.dateSep}>→</Text>
          <Pressable style={styles.dateBtn} onPress={() => { setShowStartDate(false); setShowEndDate(true); }}>
            <Text style={styles.dateBtnLabel}>To</Text>
            <Text style={styles.dateBtnValue}>{fmtDate(rangeEnd)}</Text>
          </Pressable>
        </View>

        {showStartDate && (
          <DateTimePicker
            value={rangeStart}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(_, d) => {
              setShowStartDate(Platform.OS === "ios");
              if (d) { const v = new Date(d); v.setHours(0, 0, 0, 0); setRangeStart(v); }
            }}
          />
        )}
        {showEndDate && (
          <DateTimePicker
            value={rangeEnd}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            minimumDate={rangeStart}
            onChange={(_, d) => {
              setShowEndDate(Platform.OS === "ios");
              if (d) { const v = new Date(d); v.setHours(0, 0, 0, 0); setRangeEnd(v); }
            }}
          />
        )}

        {/* Preview & Create */}
        <View style={styles.preview}>
          <Text style={styles.previewCount}>{previewCount}</Text>
          <Text style={styles.previewLabel}>events will be created</Text>
        </View>

        <Button
          title={busy ? "Creating…" : `Create ${previewCount} Event${previewCount !== 1 ? "s" : ""}`}
          gradient="aqua"
          glow
          disabled={busy || previewCount === 0}
          onPress={handleCreate}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: 60 },
  label: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.ocean,
    backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.ocean },
  pillText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },
  pillTextActive: { color: colors.white },
  dayTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  dayName: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink, width: 48 },
  timeBtn: {
    backgroundColor: colors.bgSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  timeBtnText: { fontSize: type.size.md, color: colors.ocean, fontWeight: type.weight.bold },
  dateRange: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dateBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  dateBtnLabel: { fontSize: type.size.xs, color: colors.muted, fontWeight: type.weight.bold, letterSpacing: 0.5 },
  dateBtnValue: { fontSize: type.size.sm, color: colors.ink, fontWeight: type.weight.heavy },
  dateSep: { fontSize: 18, color: colors.muted },
  preview: { alignItems: "center", paddingVertical: spacing.xl },
  previewCount: { fontSize: 56, fontWeight: type.weight.heavy, color: colors.ocean },
  previewLabel: { fontSize: type.size.sm, color: colors.muted, fontWeight: type.weight.bold },
});
