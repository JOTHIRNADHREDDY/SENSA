import { firestoreGet } from "./firestore";

export async function checkMembership(env: any, userId: string, orgId: string, allowedRoles: string[]) {
  if (!userId || !orgId) return false;
  const memId = `${userId}_${orgId}`;
  const mem = await firestoreGet(env, "memberships", memId);
  if (!mem || !mem.fields) return false;
  const role = mem.fields.role?.stringValue;
  return allowedRoles.includes(role);
}
