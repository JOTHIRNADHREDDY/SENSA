import { getFirestoreAccessToken } from "./google-auth";

export async function firestoreQuery(env: any, collectionId: string, query: any) {
  const projectId = env.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const token = await getFirestoreAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  // Ensure the from collection is set
  const structuredQuery = {
    ...query,
    from: query.from || [{ collectionId }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ structuredQuery })
  });
  return res.json();
}

export async function firestoreDelete(env: any, collection: string, id: string) {
  const projectId = env.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const token = await getFirestoreAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  return res.json();
}

export async function firestoreGet(env: any, collection: string, id: string) {
  const projectId = env.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const token = await getFirestoreAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  return res.json();
}

export async function firestoreCreate(env: any, collection: string, id: string, doc: any) {
  const projectId = env.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const token = await getFirestoreAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?documentId=${id}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(doc)
  });
  return res.json();
}

export async function firestoreUpdate(env: any, collection: string, id: string, doc: any, updateMask: string[]) {
  const projectId = env.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const token = await getFirestoreAccessToken(env);
  const maskParams = updateMask.map(m => `updateMask.fieldPaths=${m}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}?${maskParams}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(doc)
  });
  return res.json();
}

// Transaction helper for Activation Limits
export async function firestoreTransaction(env: any, writes: any[]) {
  const projectId = env.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const token = await getFirestoreAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ writes })
  });
  return res.json();
}
