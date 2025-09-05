import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!("serviceWorker" in navigator)) return;

    // Auto-detect GitHub Pages project path: "/<repo>/" from the current URL
    const segments = window.location.pathname.split("/").filter(Boolean);
    // If served as project page (e.g. /HomeApp/...), use "/HomeApp/"; else use "/"
    const scope = segments.length > 0 ? `/${segments[0]}/` : "/";

    const swUrl = `${scope}sw.js`;

    navigator.serviceWorker
      .register(swUrl, { scope })
      .then((reg) => {
        console.log("[SW] registered:", { scope: reg.scope, url: swUrl });
      })
      .catch((err) => {
        console.warn("[SW] registration failed:", err);
      });
  }, []);

  return <Stack />;
}

