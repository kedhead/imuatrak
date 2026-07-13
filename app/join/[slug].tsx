import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Universal-link target: https://imuatrak.app/join/{clubId-or-slug} maps to
 * this route when the app handles the link. Hand straight off to the real
 * join screen, which resolves the identifier and joins.
 */
export default function JoinLink() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={{ pathname: "/club/join", params: { slug } }} />;
}
