import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useRouter, type Href } from "expo-router";
import {
    addDoc, collection, deleteDoc, doc, getDocs, limit,
    onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { db } from "../../src/firebase";

// -------------------------------------------------------------
// TYPES & CONSTANTS
// -------------------------------------------------------------
type Item = {
  id: string;
  name: string;
  nameLower: string;
  purchased: boolean;
  createdAt?: { seconds: number; nanoseconds: number } | null;
};

type SortMode = "newest" | "alpha" | "unpurchased-first";
const STORAGE_KEY = "homePageId";
const SORT_KEY = "sortMode";

// -------------------------------------------------------------
// COMPONENT
// -------------------------------------------------------------
export default function ShoppingTab() {
  const router = useRouter();

  // -----------------------------------------------------------
  // STATE SECTION
  // -----------------------------------------------------------
  const [homePageId, setHomePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");

  const [hidePurchased, setHidePurchased] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("unpurchased-first");

  const [refreshing, setRefreshing] = useState(false);

  const net = Network.useNetworkState();
  const isOnline = !!net?.isConnected && net?.isInternetReachable !== false;

  // -----------------------------------------------------------
  // EFFECTS SECTION
  // -----------------------------------------------------------
  // Load selection & sort
  useEffect(() => {
    (async () => {
      try {
        const [savedHomePageId, savedSort] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SORT_KEY),
        ]);
        if (!savedHomePageId) {
          router.replace("/" as Href);
          return;
        }
        setHomePageId(savedHomePageId);
        if (savedSort === "newest" || savedSort === "alpha" || savedSort === "unpurchased-first") {
          setSortMode(savedSort as SortMode);
        } else {
          setSortMode("unpurchased-first");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Live guard: if the HomePage doc is deleted, auto-reset to onboarding
  useEffect(() => {
    if (!homePageId) return;
    const hpRef = doc(db, "homepages", homePageId);
    const unsub = onSnapshot(hpRef, async (snap) => {
      if (!snap.exists()) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        Alert.alert("HomePage deleted", "That HomePage no longer exists. Returning to start.");
        router.replace("/" as Href);
      }
    });
    return () => unsub();
  }, [homePageId, router]);

  // Live items subscription
  useEffect(() => {
    if (!homePageId) return;
    const itemsRef = collection(db, "homepages", homePageId, "shoppingItems");
    const q = query(itemsRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Item[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Item, "id">) }));
      setItems(list);
    }, (err) => Alert.alert("Firestore error", err.message));
    return () => unsub();
  }, [homePageId]);

  // -----------------------------------------------------------
  // HANDLERS SECTION
  // -----------------------------------------------------------
  const addItem = useCallback(async () => {
    const name = text.trim();
    if (!name || !homePageId) return;
    try {
      const itemsRef = collection(db, "homepages", homePageId, "shoppingItems");
      const normalized = name.toLowerCase();
      const dupQ = query(itemsRef, where("nameLower", "==", normalized), limit(1));
      const dup = await getDocs(dupQ);
      if (!dup.empty) {
        Alert.alert("Already on the list", `"${name}" is already in this HomePage.`);
        return;
      }
      await addDoc(itemsRef, { name, nameLower: normalized, purchased: false, createdAt: serverTimestamp() });
      setText("");
    } catch (e: any) {
      Alert.alert("Add failed", e.message);
    }
  }, [text, homePageId]);

  const removeItem = useCallback(async (id: string) => {
    if (!homePageId) return;
    try {
      await deleteDoc(doc(db, "homepages", homePageId, "shoppingItems", id));
    } catch (e: any) {
      Alert.alert("Delete failed", e.message);
    }
  }, [homePageId]);

  const togglePurchased = useCallback(async (id: string, current: boolean) => {
    if (!homePageId) return;
    try {
      await updateDoc(doc(db, "homepages", homePageId, "shoppingItems", id), { purchased: !current });
    } catch (e: any) {
      Alert.alert("Update failed", e.message);
    }
  }, [homePageId]);

  const clearPurchased = useCallback(async () => {
    if (!homePageId) return;
    try {
      const itemsRef = collection(db, "homepages", homePageId, "shoppingItems");
      const purchasedQ = query(itemsRef, where("purchased", "==", true));
      const snap = await getDocs(purchasedQ);
      if (snap.empty) {
        Alert.alert("Nothing to clear", "No purchased items found.");
        return;
      }
      let batch = writeBatch(db);
      let count = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      await batch.commit();
    } catch (e: any) {
      Alert.alert("Clear failed", e.message);
    }
  }, [homePageId]);

  const refreshNow = useCallback(async () => {
    if (!homePageId) return;
    setRefreshing(true);
    try {
      const itemsRef = collection(db, "homepages", homePageId, "shoppingItems");
      const q = query(itemsRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list: Item[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Item, "id">) }));
      setItems(list);
    } catch (e) {
      console.warn("Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [homePageId]);

  // -----------------------------------------------------------
  // DERIVED DATA
  // -----------------------------------------------------------
  const base = hidePurchased ? items.filter(i => !i.purchased) : items;
  const visibleItems = (() => {
    if (sortMode === "alpha") return [...base].sort((a, b) => a.nameLower.localeCompare(b.nameLower));
    if (sortMode === "unpurchased-first") {
      return [...base].sort((a, b) => (a.purchased === b.purchased ? 0 : a.purchased ? 1 : -1));
    }
    return base; // newest (Firestore order)
  })();

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
  if (!homePageId) return <View style={{ flex: 1, backgroundColor: "white" }} />;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      {!isOnline && (
        <View style={{ backgroundColor: "#fee2e2", padding: 8, borderRadius: 8 }}>
          <Text style={{ color: "#b91c1c" }}>
            You’re offline — changes will sync when you’re back online.
          </Text>
        </View>
      )}

      <Text style={{ fontSize: 24, fontWeight: "700" }}>Shopping list</Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          placeholder="Add an item..."
          value={text}
          onChangeText={setText}
          onSubmitEditing={addItem}
          maxLength={80}
          style={{
            flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 10,
          }}
        />
        <Pressable
          onPress={addItem}
          disabled={!text.trim()}
          style={{
            backgroundColor: text.trim() ? "#111" : "#aaa",
            paddingHorizontal: 16, justifyContent: "center", borderRadius: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Add</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => setHidePurchased(v => !v)}>
          <Text style={{ textDecorationLine: "underline" }}>
            {hidePurchased ? "Show purchased" : "Hide purchased"}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable
            onPress={() => {
              setSortMode(m => {
                const next = m === "newest" ? "alpha" : m === "alpha" ? "unpurchased-first" : "newest";
                AsyncStorage.setItem(SORT_KEY, next).catch(() => {});
                return next;
              });
            }}
          >
            <Text style={{ textDecorationLine: "underline" }}>
              Sort: {sortMode === "newest" ? "Newest" : sortMode === "alpha" ? "A–Z" : "Unpurchased first"}
            </Text>
          </Pressable>

          <Pressable
            onPress={clearPurchased}
            style={{ borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text>Clear purchased</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
        refreshing={refreshing}
        onRefresh={refreshNow}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 12,
              borderWidth: 1,
              borderColor: "#e5e5e5",
              borderRadius: 10,
            }}
          >
            <Pressable
              onPress={() => togglePurchased(item.id, item.purchased)}
              style={{
                width: 24, height: 24, borderWidth: 1, borderColor: "#999",
                borderRadius: 6, marginRight: 12, alignItems: "center", justifyContent: "center",
                backgroundColor: item.purchased ? "#111" : "transparent",
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 16,
                textDecorationLine: item.purchased ? "line-through" : "none",
                color: item.purchased ? "#777" : "#000",
              }}>
                {item.name}
              </Text>
            </View>
            <Pressable
              onPress={() => removeItem(item.id)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 }}
            >
              <Text style={{ fontWeight: "600" }}>Remove</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#666" }}>Nothing here yet — add your first item above.</Text>}
      />
    </View>
  );
}
