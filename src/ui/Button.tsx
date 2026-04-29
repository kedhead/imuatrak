import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, radii } from "./theme";

interface Props {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = "primary", disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "outline" && styles.outline,
        variant === "danger" && styles.danger,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === "outline" && styles.labelOutline,
          variant === "danger" && styles.labelDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primary: { backgroundColor: colors.blue },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.muted },
  danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { color: "#fff", fontWeight: "600", fontSize: 16 },
  labelOutline: { color: colors.ink },
  labelDanger: { color: colors.danger },
});
