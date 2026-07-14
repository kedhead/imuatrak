import { Linking, Text, type StyleProp, type TextStyle } from "react-native";

// Capture group so String.split keeps the URLs in the result array.
const URL_RE = /(https?:\/\/[^\s]+)/gi;

/** True when a URL points directly at an image/GIF (path ends in an image ext). */
export function isImageUrl(url: string): boolean {
  const pathOnly = url.split(/[?#]/)[0] ?? url;
  return /\.(gif|png|jpe?g|webp)$/i.test(pathOnly);
}

/** All direct image/GIF URLs contained in a piece of text. */
export function extractImageUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).filter(isImageUrl);
}

/**
 * Renders text with http(s) links tappable (opens the browser). Trailing
 * punctuation like "check this: https://x.co/a." keeps the dot out of the URL.
 */
export function LinkifiedText({
  text,
  style,
  linkStyle,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
}) {
  const parts = text.split(URL_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part)) return part;
        // Don't swallow trailing punctuation into the link.
        const match = part.match(/^(.*?)([.,;:!?)]*)$/s);
        const url = match?.[1] ?? part;
        const trailing = match?.[2] ?? "";
        return (
          <Text key={i}>
            <Text
              style={linkStyle}
              onPress={() => Linking.openURL(url).catch(() => undefined)}
            >
              {url}
            </Text>
            {trailing}
          </Text>
        );
      })}
    </Text>
  );
}
