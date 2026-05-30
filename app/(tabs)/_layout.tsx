import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, shadow, type } from "@/ui/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color, focused }: { name: IoniconName; color: ColorValue; focused: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(focused ? 1.18 : 1, { damping: 12, stiffness: 260 });
  }, [focused, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.icon, style]}>
      <Ionicons name={name} color={color} size={24} />
      {focused && <View style={[styles.dot, { backgroundColor: color }]} />}
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.aqua,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: { paddingTop: 8 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sessions",
          tabBarIcon: ({ color, focused }) => <TabIcon name="boat" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="club"
        options={{
          title: "Club",
          tabBarIcon: ({ color, focused }) => <TabIcon name="people" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => <TabIcon name="settings" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: Platform.OS === "ios" ? 24 : 16,
    height: 68,
    borderRadius: 28,
    backgroundColor: colors.white,
    borderTopWidth: 0,
    paddingHorizontal: 8,
    ...shadow.lg,
  },
  label: { fontSize: 11, fontWeight: type.weight.bold, marginTop: 2 },
  icon: { alignItems: "center", justifyContent: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
});
