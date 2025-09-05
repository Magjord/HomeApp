import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

export default function RootLayout() {
  // Register a service worker when running on the web build
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!("serviceWorker" in navigator)) return;

    // Use the <base href="..."> tag to figure out the GitHub Pages base path (/HomeApp/)
    const base = document.querySelector("base")?.getAttribute("href") || "/";
    // Ensure trailing slash
    const scope = base.endsWith("/") ? base : base + "/";
    const swUrl = scope + "sw.js";

    navigator.serviceWorker
      .register(swUrl, { scope })
      .then((reg) => {
        // Optional: console log for first load
        console.log("[SW] registered with scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[SW] registration failed:", err);
      });
  }, []);

  return <Stack />;
}
