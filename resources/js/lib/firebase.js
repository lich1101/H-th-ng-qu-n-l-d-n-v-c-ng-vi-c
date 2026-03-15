import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

const config = window?.__FIREBASE__ || {};

const isReady = () =>
    Boolean(
        config?.apiKey &&
            config?.projectId &&
            config?.databaseURL &&
            config?.appId &&
            config?.authDomain
    );

let appInstance = null;
let dbInstance = null;
let authInstance = null;

export const firebaseReady = isReady();

export const getFirebaseApp = () => {
    if (!firebaseReady) return null;
    if (appInstance) return appInstance;
    if (getApps().length) {
        appInstance = getApps()[0];
        return appInstance;
    }
    appInstance = initializeApp(config);
    return appInstance;
};

export const getFirebaseDb = () => {
    if (!firebaseReady) return null;
    if (dbInstance) return dbInstance;
    const app = getFirebaseApp();
    if (!app) return null;
    dbInstance = getDatabase(app);
    return dbInstance;
};

export const ensureFirebaseAuth = async (customToken) => {
    if (!firebaseReady) return false;
    const app = getFirebaseApp();
    if (!app) return false;
    if (!authInstance) authInstance = getAuth(app);
    if (authInstance.currentUser) return true;
    if (!customToken) return false;
    try {
        await signInWithCustomToken(authInstance, customToken);
        return true;
    } catch (e) {
        return false;
    }
};

export const onFirebaseConnectionChange = (callback) => {
    const db = getFirebaseDb();
    if (!db) {
        callback(false);
        return () => {};
    }
    const connectionRef = ref(db, '.info/connected');
    return onValue(connectionRef, (snapshot) => {
        callback(Boolean(snapshot.val()));
    });
};
