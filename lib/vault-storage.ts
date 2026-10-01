"use client";

import type { SavedEcho } from "@/lib/echo";

const DB_NAME = "echovault";
const DB_VERSION = 1;
const STORE = "echoes";

type StoredEcho = SavedEcho & { video?: Blob };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveEchoLocal(echo: SavedEcho, video?: Blob | null) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ ...echo, hasLocalVideo: Boolean(video), video: video ?? undefined });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function listEchoesLocal() {
  const db = await openDb();
  const rows = await new Promise<StoredEcho[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredEcho[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows
    .map(({ video: _video, ...echo }) => echo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEchoVideoLocal(id: string) {
  const db = await openDb();
  const row = await new Promise<StoredEcho | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as StoredEcho | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return row?.video ?? null;
}

export async function deleteEchoLocal(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
