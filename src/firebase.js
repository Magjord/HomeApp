import { getApp, getApps, initializeApp } from "firebase/app";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager
} from "firebase/firestore";
import { Platform } from "react-native";


const firebaseConfig = {
  apiKey: "AIzaSyB_bmrlO9dpV5LtJak1sOt7-ezBXU-Uijg",
  authDomain: "homeapp-20fc6.firebaseapp.com",
  projectId: "homeapp-20fc6",
  storageBucket: "homeapp-20fc6.firebasestorage.app",
  messagingSenderId: "787661269547",
  appId: "1:787661269547:web:b882d88e747e343ee4d86e"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db =
  Platform.OS === "web"
    ? initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager(),
        }),
      })
    : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
