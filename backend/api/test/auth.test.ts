import { describe, it, expect, vi } from "vitest";
import { checkMembership } from "../utils/auth";
import * as firestore from "../utils/firestore";

// Mock firestore utils
vi.mock("../utils/firestore", () => {
  return {
    firestoreGet: vi.fn(),
    firestoreCreate: vi.fn(),
    firestoreUpdate: vi.fn(),
    firestoreQuery: vi.fn(),
    firestoreTransaction: vi.fn()
  };
});

describe("RBAC checkMembership", () => {
  it("should allow access if user has exact required role", async () => {
    vi.mocked(firestore.firestoreGet).mockResolvedValueOnce({
      fields: { role: { stringValue: "admin" } }
    });

    const result = await checkMembership({}, "user123", "org456", ["admin"]);
    expect(result).toBe(true);
  });

  it("should allow access if user has one of the allowed roles", async () => {
    vi.mocked(firestore.firestoreGet).mockResolvedValueOnce({
      fields: { role: { stringValue: "owner" } }
    });

    const result = await checkMembership({}, "user123", "org456", ["owner", "admin", "viewer"]);
    expect(result).toBe(true);
  });

  it("should deny access if user has wrong role", async () => {
    vi.mocked(firestore.firestoreGet).mockResolvedValueOnce({
      fields: { role: { stringValue: "viewer" } }
    });

    const result = await checkMembership({}, "user123", "org456", ["owner", "admin"]);
    expect(result).toBe(false);
  });

  it("should deny access if membership does not exist", async () => {
    vi.mocked(firestore.firestoreGet).mockResolvedValueOnce(null);

    const result = await checkMembership({}, "user123", "org456", ["owner", "admin"]);
    expect(result).toBe(false);
  });
});
