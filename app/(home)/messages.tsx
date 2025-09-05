import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useRouter, type Href } from "expo-router";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";
import { db } from "../../src/firebase";

// -------------------------------------------------------------
// TYPES & CONSTANTS
// -------------------------------------------------------------
type Message = {
  id: string;
  text: string;
  author: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
};

const STORAGE_KEY = "homePageId";
const NICK_KEY = "nickname";

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------
const clamp = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

function formatTs(ts?: { seconds: number; nanoseconds: number } | null) {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1e6));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// -------------------------------------------------------------
// COMPONENT
// -------------------------------------------------------------
export default function MessagesTab() {
  const router = useRouter();

  // -----------------------------------------------------------
  // STATE SECTION
  // -----------------------------------------------------------
  const [homePageId, setHomePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nickname, setNickname] = useState("");
  const [nickSaved, setNickSaved] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const net = Network.useNetworkState();
  const isOnline = !!net?.isConnected && net?.isInternetReachable !== false;

  // -----------------------------------------------------------
  // EFFECTS SECTION
  // -----------------------------------------------------------
  // Load selection + nickname (or go back)
  useEffect(() => {
    (async () => {
      try {
        const [savedId, savedNick] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(NICK_KEY),
        ]);
        if (!savedId) {
          router.replace("/" as Href);
          return;
        }
        setHomePageId(savedId);
        if (savedNick) {
          setNickname(savedNick);
          setNickSaved(true);
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

  // Subscribe to messages
  useEffect(() => {
    if (!homePageId) return;
    const msgsRef = collection(db, "homepages", homePageId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "desc")); // newest first
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Message[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Message, "id">) }));
        setMessages(list);
      },
      (err) => Alert.alert("Firestore error", err.message)
    );
    return () => unsub();
  }, [homePageId]);

  // -----------------------------------------------------------
  // HANDLERS SECTION
  // -----------------------------------------------------------
  const saveNickname = useCallback(async () => {
    const trimmed = clamp(nickname.trim(), 40);
    if (!trimmed) {
      Alert.alert("Nickname required", "Please enter a name (max 40 chars).");
      return;
    }
    setNickname(trimmed);
    await AsyncStorage.setItem(NICK_KEY, trimmed);
    setNickSaved(true);
  }, [nickname]);

  const sendMessage = useCallback(async () => {
    if (!homePageId) return;
    const body = clamp(text.trim(), 500);
    const author = clamp(nickname.trim() || "Anonymous", 40);
    if (!body) return;
    try {
      const msgsRef = collection(db, "homepages", homePageId, "messages");
      await addDoc(msgsRef, {
        text: body,
        author,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (e: any) {
      Alert.alert("Send failed", e.message);
    }
  }, [homePageId, text, nickname]);

  const deleteMessage = useCallback(
    async (id: string) => {
      if (!homePageId) return;
      try {
        await deleteDoc(doc(db, "homepages", homePageId, "messages", id));
      } catch (e: any) {
        Alert.alert("Delete failed", e.message);
      }
    },
    [homePageId]
  );

  const refreshNow = useCallback(async () => {
    if (!homePageId) return;
    setRefreshing(true);
    try {
      const msgsRef = collection(db, "homepages", homePageId, "messages");
      const q = query(msgsRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list: Message[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Message, "id">) }));
      setMessages(list);
    } catch (e) {
      console.warn("Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [homePageId]);

  const canSend = useMemo(() => text.trim().length > 0, [text]);

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
            You’re offline — messages will send when you’re back online.
          </Text>
        </View>
      )}

      {/* Nickname setup */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: "#666" }}>Your name (for messages)</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            placeholder="e.g. Magnus"
            value={nickname}
            onChangeText={(v) => {
              setNickname(v);
              setNickSaved(false);
            }}
            maxLength={40}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <Pressable
            onPress={saveNickname}
            style={{
              backgroundColor: "#111",
              paddingHorizontal: 16,
              justifyContent: "center",
              borderRadius: 8,
              opacity: nickname.trim() ? 1 : 0.6,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>
              {nickSaved ? "Saved" : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Compose row */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          placeholder="Write a message…"
          value={text}
          onChangeText={setText}
          onSubmitEditing={sendMessage}
          maxLength={500}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        />
        <Pressable
          onPress={sendMessage}
          disabled={!canSend}
          style={{
            backgroundColor: canSend ? "#111" : "#aaa",
            paddingHorizontal: 16,
            justifyContent: "center",
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Send</Text>
        </Pressable>
      </View>

      {/* Messages list */}
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        refreshing={refreshing}
        onRefresh={refreshNow}
        contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
        renderItem={({ item }) => (
          <View
            style={{
              gap: 6,
              padding: 12,
              borderWidth: 1,
              borderColor: "#e5e5e5",
              borderRadius: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "700" }}>{item.author || "Anonymous"}</Text>
              <Text style={{ color: "#777", fontSize: 12 }}>{formatTs(item.createdAt ?? null)}</Text>
            </View>
            <Text style={{ fontSize: 16 }}>{item.text}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => deleteMessage(item.id)}
                style={{ borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#666" }}>No messages yet — say hello 👋</Text>
        }
      />
    </View>
  );
}
