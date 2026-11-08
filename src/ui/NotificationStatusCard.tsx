import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/services/invite";
import { registerPush, usePushStatus, type PushStatus } from "@/services/pushRegistration";
import { Button } from "./Button";
import { GradientCard } from "./GradientCard";
import { colors, spacing, type } from "./theme";

const STORE_URL = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
const STORE_NAME = Platform.OS === "ios" ? "App Store" : "Play Store";

/**
 * Settings → Notifications: what this phone's push status is, in plain words,
 * with the one action that fixes it. Built for the "I don't get chat
 * notifications" report — the member can see (and tell their coach) whether
 * it's permission, an old app build, or something on the phone itself.
 */
export function NotificationStatusCard({ uid }: { uid: string }) {
  const status = usePushStatus((s) => s.status);
  const [busy, setBusy] = useState(false);

  // Settings can open before the launch registration finishes; fetch a
  // status without prompting so the card never sits empty.
  useEffect(() => {
    if (!status) void registerPush(uid, { prompt: false });
  }, [uid, status]);

  const retry = async (prompt: boolean) => {
    setBusy(true);
    try {
      await registerPush(uid, { prompt });
    } finally {
      setBusy(false);
    }
  };

  const view = describe(status);

  return (
    <GradientCard>
      <View style={styles.row}>
        <Ionicons name={view.icon} size={22} color={view.color} />
        <View style={styles.flex}>
          <Text style={styles.title}>{view.title}</Text>
          <Text style={styles.body}>{view.body}</Text>
        </View>
      </View>

      {status?.state === "denied" &&
        (status.canAskAgain ? (
          <Button title="Turn on" gradient="aqua" disabled={busy} onPress={() => void retry(true)} style={styles.btn} />
        ) : (
          <Button
            title="Open phone settings"
            gradient="aqua"
            onPress={() => void Linking.openSettings()}
            style={styles.btn}
          />
        ))}
      {status?.state === "undetermined" && (
        <Button title="Turn on" gradient="aqua" disabled={busy} onPress={() => void retry(true)} style={styles.btn} />
      )}
      {status?.state === "error" && (
        <>
          <Button
            title={`Update from the ${STORE_NAME}`}
            gradient="aqua"
            onPress={() => void Linking.openURL(STORE_URL)}
            style={styles.btn}
          />
          <Button
            title={busy ? "Trying…" : "Try again"}
            variant="outline"
            disabled={busy}
            onPress={() => void retry(false)}
            style={styles.btnSm}
          />
        </>
      )}

      {status && (
        <Text style={styles.meta} selectable>
          App {status.appVersion ?? "?"} (build {status.appBuild ?? "?"})
          {status.error ? ` · ${status.error}` : ""}
        </Text>
      )}
    </GradientCard>
  );
}

function describe(status: PushStatus | null): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  body: string;
} {
  switch (status?.state) {
    case "registered":
      return {
        icon: "notifications",
        color: colors.success,
        title: "On for this phone",
        body:
          Platform.OS === "android"
            ? "Still missing some? Check the chat isn't muted, and that your phone's battery saver isn't restricting ImuaTrak."
            : "Still missing some? Check the chat isn't muted, and that Focus mode isn't silencing ImuaTrak.",
      };
    case "denied":
      return {
        icon: "notifications-off",
        color: colors.coral,
        title: "Off for this phone",
        body: status.canAskAgain
          ? "You won't hear about chat messages or mentions until you turn them on."
          : "Notifications are turned off for ImuaTrak in your phone's settings. Turn them on there to get chat messages.",
      };
    case "undetermined":
      return {
        icon: "notifications-outline",
        color: colors.muted,
        title: "Not set up yet",
        body: "Turn on notifications to hear about chat messages and mentions.",
      };
    case "error":
      return {
        icon: "warning",
        color: colors.sunset,
        title: "This phone couldn't sign up",
        body:
          Platform.OS === "android"
            ? `Older versions of ImuaTrak can't receive notifications on Android. Update from the ${STORE_NAME}, then reopen the app.`
            : `Something went wrong setting up notifications. Try again, or update from the ${STORE_NAME}.`,
      };
    default:
      return {
        icon: "notifications-outline",
        color: colors.muted,
        title: "Checking…",
        body: "Looking at this phone's notification settings.",
      };
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  body: { fontSize: type.size.sm, color: colors.muted, lineHeight: 19, marginTop: 2 },
  btn: { marginTop: spacing.md },
  btnSm: { marginTop: spacing.sm, minHeight: 44 },
  meta: { fontSize: 11, color: colors.muted, marginTop: spacing.md },
});
