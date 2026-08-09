import { Fragment } from "react";
import { Linking, Text, type StyleProp, type TextStyle } from "react-native";
import { findMentionSpans, type MentionTarget } from "@/services/mentions";

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
 *
 * When `mentions` is supplied, any `@Name` in the text that matches one of
 * those people is styled too — with `selfMentionStyle` for the reader's own
 * name, so being tagged is visible at a glance while scrolling.
 */
export function LinkifiedText({
  text,
  style,
  linkStyle,
  mentions,
  mentionStyle,
  selfMentionStyle,
  selfUid,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  mentions?: MentionTarget[];
  mentionStyle?: StyleProp<TextStyle>;
  selfMentionStyle?: StyleProp<TextStyle>;
  selfUid?: string;
}) {
  const parts = text.split(URL_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part)) {
          return (
            <Fragment key={i}>
              {renderMentions(part, mentions, mentionStyle, selfMentionStyle, selfUid)}
            </Fragment>
          );
        }
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

function renderMentions(
  part: string,
  mentions: MentionTarget[] | undefined,
  mentionStyle: StyleProp<TextStyle>,
  selfMentionStyle: StyleProp<TextStyle>,
  selfUid: string | undefined,
) {
  if (!mentions?.length || !part) return part;
  const spans = findMentionSpans(part, mentions);
  if (spans.length === 0) return part;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.start > cursor) out.push(part.slice(cursor, span.start));
    out.push(
      <Text
        key={`m${i}`}
        style={[mentionStyle, span.uid === selfUid && selfMentionStyle]}
      >
        {part.slice(span.start, span.end)}
      </Text>,
    );
    cursor = span.end;
  });
  if (cursor < part.length) out.push(part.slice(cursor));
  return out;
}
