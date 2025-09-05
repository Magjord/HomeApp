import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, type Href } from "expo-router";
import { collection, doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { db } from "../src/firebase";

// -------------------------------------------------------------
// CONSTANTS & HELPERS
// -------------------------------------------------------------
const STORAGE_KEY = "homePageId";

// Normalize name -> unique key (lowercase, spaces→dashes, [a-z0-9-], max 40)
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
export default function Index() {
  const router = useRouter();

  // -----------------------------------------------------------
  // STATE SECTION
  // -----------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");

  // -----------------------------------------------------------
  // EFFECTS SECTION
  // -----------------------------------------------------------
  // On boot: if a saved HomePage exists, verify it still exists in Firestore.
  // If it does, route into tabs; if not, clear the stale ID and stay on onboarding.
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const snap = await getDoc(doc(db, "homepages", saved));
        if (snap.exists()) {
          router.replace("/(home)/home" as Href);
          return;
        }
        await AsyncStorage.removeItem(STORAGE_KEY); // stale id
      }
      setLoading(false);
    })();
  }, [router]);

  // -----------------------------------------------------------
  // HANDLERS SECTION
  // -----------------------------------------------------------
  const createByName = useCallback(async () => {
    const name = createName.trim();
    const key = toNameKey(name);
    if (!name || !key) {
      Alert.alert("Invalid name", "Please enter a valid name (letters/numbers/spaces).");
      return;
    }

    try {
      // Atomically create the HomePage and claim the name mapping
      const id = await runTransaction(db, async (tx) => {
        const hpRef = doc(collection(db, "homepages")); // new random ID
        const mapRef = doc(db, "homepagesByName", key);

        const mapSnap = await tx.get(mapRef);
        if (mapSnap.exists()) throw new Error("That name is already taken. Pick a different one.");

        tx.set(hpRef, { createdAt: serverTimestamp(), name, nameKey: key });
        tx.set(mapRef, { homePageId: hpRef.id }, { merge: true });

        return hpRef.id;
      });

      await AsyncStorage.setItem(STORAGE_KEY, id);
      setCreateName("");
      router.replace("/(home)/home" as Href);
    } catch (e: any) {
      Alert.alert("Create failed", e.message ?? String(e));
    }
  }, [createName, router]);

  const joinByName = useCallback(async () => {
    const key = toNameKey(joinName);
    if (!key) {
      Alert.alert("Invalid name", "Enter a valid HomePage name.");
      return;
    }
    try {
      const mapSnap = await getDoc(doc(db, "homepagesByName", key));
      if (!mapSnap.exists()) {
        Alert.alert("Not found", "No HomePage with that name.");
        return;
      }
      const { homePageId } = mapSnap.data() as { homePageId: string };
      await AsyncStorage.setItem(STORAGE_KEY, homePageId);
      setJoinName("");
      router.replace("/(home)/home" as Href);
    } catch (e: any) {
      Alert.alert("Join failed", e.message ?? String(e));
    }
  }, [joinName, router]);

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

  return (
    <View style={{ flex: 1, padding: 16, gap: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "700", textAlign: "center" }}>
        Welcome to HomeApp
      </Text>

      {/* Create by name */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "600" }}>Create a new HomePage (choose a unique name)</Text>
        <TextInput
          placeholder="e.g. magnus-home"
          autoCapitalize="none"
          value={createName}
          onChangeText={setCreateName}
          style={{
            borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 10,
          }}
        />
        <Pressable
          onPress={createByName}
          disabled={!toNameKey(createName)}
          style={{
            backgroundColor: toNameKey(createName) ? "#111" : "#aaa",
            paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Create</Text>
        </Pressable>
        <Text style={{ color: "#666" }}>
          Tip: names are normalized (lowercase, spaces→dashes) and can be changed later.
        </Text>
      </View>

      {/* Join by name */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "600" }}>Or join an existing HomePage by name</Text>
        <TextInput
          placeholder="e.g. magnus-home"
          autoCapitalize="none"
          value={joinName}
          onChangeText={setJoinName}
          style={{
            borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 10,
          }}
        />
        <Pressable
          onPress={joinByName}
          disabled={!toNameKey(joinName)}
          style={{
            backgroundColor: toNameKey(joinName) ? "#111" : "#aaa",
            paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Join</Text>
        </Pressable>
      </View>
    </View>
  );
}
