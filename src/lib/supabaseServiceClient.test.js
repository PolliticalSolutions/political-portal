import { describe, expect, it } from "vitest";
import { getSupabaseServiceClient } from "./supabaseServiceClient.js";

describe("getSupabaseServiceClient", () => {
  it("never creates a privileged Supabase client in browser code", () => {
    expect(getSupabaseServiceClient()).toBeNull();
  });
});
