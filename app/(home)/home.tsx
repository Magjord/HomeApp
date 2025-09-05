import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useRouter, type Href } from "expo-router";
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { db } from "../../src/firebase";

// -------------------------------------------------------------
// CONSTANTS & HELPERS
// -------------------------------------------------------------
const STORAGE_KEY = "homePageId";

const toNameKey = (s: string) =>
  s.trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

// -------------------------------------------------------------
// COMPONENT
// -------------------------------------------------------------
export default function HomeTab() {
  const router = useRouter();

  // -----------------------------------------------------------
  // STATE SECTION
  // -----------------------------------------------------------
  const [homePageId, setHomePageId] = useState<string | null>(null);
  const [homePageName, setHomePageName] = useState<string | null>(null);
  const [homePageKey, setHomePageKey] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [loading, setLoading] = useState(true);

  // Offline banner
  const net = Network.useNetworkState();
  const isOnline = !!net?.isConnected && net?.isInternetReachable !== false;

  // -----------------------------------------------------------
  // EFFECTS SECTION
  // -----------------------------------------------------------
  // Load saved HomePage ID or return to onboarding
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (!saved) {
        router.replace("/" as Href);
        return;
      }
      setHomePageId(saved);
      setLoading(false);
    })();
  }, [router]);

  // Subscribe to HomePage doc & auto-recover if deleted
  useEffect(() => {
    if (!homePageId) return;
    const hpRef = doc(db, "homepages", homePageId);
    const unsub = onSnapshot(hpRef, async (snap) => {
      if (!snap.exists()) {
        // Auto-recover if the doc was deleted
        await AsyncStorage.removeItem(STORAGE_KEY);
        Alert.alert("HomePage deleted", "That HomePage no longer exists. Returning to start.");
        router.replace("/" as Href);
        return;
      }
      const data = snap.data() as { name?: string; nameKey?: string } | undefined;
      setHomePageName(data?.name ?? null);
      setHomePageKey(data?.nameKey ?? null);
      if (data?.name) setRenameText(data.name);
    });
    return () => unsub();
  }, [homePageId, router]);

  // -----------------------------------------------------------
  // HANDLERS SECTION
  // -----------------------------------------------------------
  const switchHomePage = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setHomePageId(null);
    setHomePageName(null);
    setHomePageKey(null);
    setRenameText("");
    router.replace("/" as Href);
  }, [router]);

  const saveRename = useCallback(async () => {
    if (!homePageId) return;
    const name = renameText.trim();
    const newKey = toNameKey(name);
    if (!name || !newKey) {
      Alert.alert("Invalid name", "Please enter a valid name.");
      return;
    }

    try {
      await runTransaction(db, async (tx) => {
        const hpRef = doc(db, "homepages", homePageId);
        const newKeyRef = doc(db, "homepagesByName", newKey);
        const oldKeyRef = homePageKey ? doc(db, "homepagesByName", homePageKey) : null;

        const newKeySnap = await tx.get(newKeyRef);
        if (newKeySnap.exists()) {
          const mapped = newKeySnap.data() as { homePageId: string };
          if (mapped.homePageId !== homePageId) {
            throw new Error("That name is already taken. Pick a different one.");
          }
        }

        tx.set(hpRef, { name, nameKey: newKey }, { merge: true });
        tx.set(newKeyRef, { homePageId }, { merge: true });

        if (oldKeyRef && homePageKey && homePageKey !== newKey) {
          const oldKeySnap = await tx.get(oldKeyRef);
          if (oldKeySnap.exists()) {
            const mappedOld = oldKeySnap.data() as { homePageId: string };
            if (mappedOld.homePageId === homePageId) tx.delete(oldKeyRef);
          }
        }
      });

      Alert.alert("Saved", "HomePage name updated.");
    } catch (e: any) {
      Alert.alert("Rename failed", e.message ?? String(e));
    }
  }, [homePageId, renameText, homePageKey]);

  // -----------------------------------------------------------
  // RENDER SECTION
  // -----------------------------------------------------------
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }
  if (!homePageId) return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      {!isOnline && (
        <View style={{ backgroundColor: "#fee2e2", padding: 8, borderRadius: 8 }}>
          <Text style={{ color: "#b91c1c" }}>
            You’re offline — changes will sync when you’re back online.
          </Text>
        </View>
      )}

      <Text style={{ fontSize: 24, fontWeight: "700" }}>Home</Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: "#666" }}>HomePage name</Text>
        <TextInput
          placeholder="Rename this HomePage"
          value={renameText}
          onChangeText={setRenameText}
          maxLength={40}
          style={{
            borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 10,
          }}
        />
        <Pressable
          onPress={saveRename}
          disabled={!renameText.trim()}
          style={{
            alignSelf: "flex-start",
            backgroundColor: renameText.trim() ? "#111" : "#aaa",
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Save</Text>
        </Pressable>

        <View style={{ marginTop: 8 }}>
          <Text style={{ color: "#666" }}>
            Current name: <Text style={{ fontWeight: "700" }}>{homePageName ?? "Unnamed Home"}</Text>
          </Text>
          {homePageKey ? (
            <Text style={{ color: "#666", marginTop: 4 }}>
              Share & join by name: <Text style={{ fontWeight: "700" }}>{homePageKey}</Text>
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: "#eee", marginVertical: 12 }} />

      <Pressable
        onPress={switchHomePage}
        style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <Text>Switch HomePage</Text>
      </Pressable>
    </View>
  );
}
