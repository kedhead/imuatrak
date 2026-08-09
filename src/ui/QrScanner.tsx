import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/Button";
import { colors, radii, spacing, type } from "@/ui/theme";

/**
 * Full-bleed QR scanner.
 *
 * Kept in its own module and imported lazily by the join screen: expo-camera
 * is a native module, so a static import would crash any binary built before
 * it was added (same guard the GPX document picker uses). Nothing outside this
 * file may import expo-camera directly.
 */
export function QrScanner({
  onScanned,
  onCancel,
  hint,
}: {
  onScanned: (data: string) => void;
  onCancel: () => void;
  hint?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  // The camera keeps firing for every frame that still contains the code —
  // without this latch a single QR triggers dozens of join attempts.
  const handled = useRef(false);

  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.centered]}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>
          ImuaTrak uses the camera only to read a club&apos;s invite QR code.
        </Text>
        <Button
          title={permission.canAskAgain ? "Allow camera" : "Open Settings"}
          gradient="aqua"
          onPress={() => void requestPermission()}
          style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
        />
        <Button
          title="Enter a code instead"
          variant="outline"
          light
          onPress={onCancel}
          style={{ marginTop: spacing.sm, alignSelf: "stretch" }}
        />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          handled.current = true;
          onScanned(data);
        }}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.reticle} />
        <Text style={styles.hint}>{hint ?? "Point at the club's invite QR code"}</Text>
        <View style={styles.controls}>
          <Pressable onPress={() => setTorch((t) => !t)} style={styles.controlBtn}>
            <Text style={styles.controlText}>{torch ? "Torch off" : "Torch on"}</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={styles.controlBtn}>
            <Text style={styles.controlText}>Enter a code</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  centered: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  title: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.white, textAlign: "center" },
  body: {
    fontSize: type.size.md,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  reticle: {
    width: 240,
    height: 240,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: "transparent",
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: type.size.md,
    fontWeight: type.weight.bold,
    color: colors.white,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  controls: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  controlBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  controlText: { color: colors.white, fontWeight: type.weight.bold, fontSize: type.size.sm },
});
