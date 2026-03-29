import { describe, expect, it } from "vitest";
import { getAllPosts, getAllPostsIncludingDrafts, getPostBySlug } from "./blogLoader.js";

describe("blogLoader", () => {
  it("getAllPosts returns only non-draft posts", () => {
    const posts = getAllPosts();
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(posts.every((post) => post.meta.draft === false)).toBe(true);
  });

  it("returns posts sorted by date descending", () => {
    const posts = getAllPostsIncludingDrafts();
    const dates = posts.map((post) => post.meta.date);
    expect(dates).toEqual([...dates].sort((a, b) => (a < b ? 1 : -1)));
  });

  it("getPostBySlug returns the correct post content", () => {
    const post = getPostBySlug("2026-02-25-campaign-data-operations-baseline");
    expect(post).toBeTruthy();
    expect(post?.content).toContain("## What to standardise first");
  });

  it("returns null for a missing slug", () => {
    const post = getPostBySlug("does-not-exist");
    expect(post).toBeNull();
  });
});