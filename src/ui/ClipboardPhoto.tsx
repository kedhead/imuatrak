import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, spacing, type } from "./theme";

/**
 * Whether the clipboard holds a photo, kept fresh: on mount, when the app
 * comes back to the front (you copied it in another app), when the clipboard
 * changes while we're open, and whenever the caller asks (input focus).
 *
 * hasImageAsync only asks the OS *whether* there's an image; it never reads
 * it, so it doesn't trigger iOS's "pasted from…" banner. Only tapping Paste
 * reads the image.
 */
export function useClipboardPhoto(): { hasPhoto: boolean; recheck: () => void } {
  const [hasPhoto, setHasPhoto] = useState(false);
  const recheck = useCallback(() => {
    void Clipboard.hasImageAsync()
      .then(setHasPhoto)
      .catch(() => setHasPhoto(false));
  }, []);

  useEffect(() => {
    recheck();
    const app = AppState.addEventListener("change", (s) => s === "active" && recheck());
    const clip = Clipboard.addClipboardListener(() => recheck());
    return () => {
      app.remove();
      Clipboard.removeClipboardListener(clip);
    };
  }, [recheck]);

  return { hasPhoto, recheck };
}

const JPEG_OPTIONS: Clipboard.GetImageOptions = { format: "jpeg", jpegQuality: 0.9 };

/** Save a clipboard image to a cache file shaped like an image-picker asset. */
async function toAsset(img: Clipboard.ClipboardImage): Promise<ImagePickerAsset> {
  const base64 = img.data.replace(/^data:image\/\w+;base64,/, "");
  const uri = `${FileSystem.cacheDirectory}pasted-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return {
    uri,
    width: img.size.width,
    height: img.size.height,
    type: "image",
    mimeType: "image/jpeg",
    fileName: "pasted.jpg",
  };
}

/** Read the clipboard photo (Android, and iOS before 16). */
export async function readClipboardPhoto(): Promise<ImagePickerAsset | null> {
  const img = await Clipboard.getImageAsync(JPEG_OPTIONS);
  return img?.data ? toAsset(img) : null;
}

/**
 * Paste button above a chat composer, shown while the clipboard holds a
 * picture (Apple's native Paste button on iOS 16+, our own chip elsewhere). React Native's text box can't accept a pasted image itself, so
 * this is the paste path; it stages the photo in the same caption preview
 * as picking one from the library.
 */
export function PastePhotoChip({
  visible,
  onPaste,
}: {
  visible: boolean;
  onPaste: (asset: ImagePickerAsset) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!visible) return null;

  // iOS 16+: Apple's own Paste button. Tapping it is the user's consent, so
  // there's no "Allow Paste?" prompt (reading the clipboard ourselves would
  // ask every time).
  if (Platform.OS === "ios" && Clipboard.isPasteButtonAvailable) {
    return (
      <Clipboard.ClipboardPasteButton
        acceptedContentTypes={["image"]}
        imageOptions={JPEG_OPTIONS}
        displayMode="iconAndLabel"
        cornerStyle="capsule"
        backgroundColor={colors.ocean}
        foregroundColor={colors.white}
        style={styles.native}
        onPress={(data) => {
          if (data.type !== "image" || !data.data) return;
          void toAsset(data)
            .then(onPaste)
            .catch(() => Alert.alert("Couldn't paste", "Try copying the photo again."));
        }}
      />
    );
  }

  const paste = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const asset = await readClipboardPhoto();
      if (asset) onPaste(asset);
      else Alert.alert("Nothing to paste", "Copy a photo first, then tap Paste photo.");
    } catch {
      Alert.alert("Couldn't paste", "Try copying the photo again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable style={styles.chip} onPress={paste} hitSlop={6} accessibilityLabel="Paste photo from clipboard">
      {busy ? (
        <ActivityIndicator size="small" color={colors.ocean} />
      ) : (
        <Ionicons name="clipboard-outline" size={16} color={colors.ocean} />
      )}
      <Text style={styles.text}>Paste photo</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginLeft: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.ocean,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  // The native button needs an explicit size; this fits "Paste" + icon.
  native: { width: 104, height: 34, marginLeft: spacing.md, marginBottom: spacing.xs },
  text: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },
});
