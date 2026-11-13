import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Shrink a photo before it's uploaded.
 *
 * Phone cameras produce 4000-px, 4–8 MB photos; nothing in the app shows an
 * image wider than a screen, so they cost upload time on beach signal, storage,
 * and every member's download and decode. The base64 callables (posts, DMs,
 * avatars) also top out around 7 MB, so big originals used to fail outright.
 *
 * Only still images are touched: videos and GIFs (which would lose their
 * animation) pass through unchanged. Never throws — if anything goes wrong the
 * original is uploaded, exactly as before.
 */
export async function prepareImageForUpload(
  localUri: string,
  mimeType: string,
  maxDimension = 2048,
): Promise<{ uri: string; mimeType: string }> {
  const original = { uri: localUri, mimeType };
  if (!mimeType.startsWith("image/") || mimeType === "image/gif") return original;
  try {
    const source = await ImageManipulator.manipulate(localUri).renderAsync();
    const { width, height } = source;
    // Anything already screen-sized goes up untouched (a small PNG screenshot
    // stays a crisp PNG rather than becoming a blurrier JPEG).
    if (Math.max(width, height) <= maxDimension) return original;

    const rendered = await ImageManipulator.manipulate(localUri)
      .resize(width >= height ? { width: maxDimension } : { height: maxDimension })
      .renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: "image/jpeg" };
  } catch {
    return original;
  }
}
