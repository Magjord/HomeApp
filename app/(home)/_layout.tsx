import { Tabs } from "expo-router";

export default function HomeTabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitleAlign: "center" }}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="shopping" options={{ title: "Shopping" }} />
      <Tabs.Screen name="messages" options={{ title: "Messages" }} />
    </Tabs>
  );
}
