import { getAllBlogPostsIncludingDrafts, getPublishedBlogPosts } from "./blog-content.mjs";

export const getPublishedBlogRoutes = () =>
  getPublishedBlogPosts().map((post) => `/blog/${post.slug}`);

export const getAllBlogRoutesIncludingDrafts = () =>
  getAllBlogPostsIncludingDrafts().map((post) => `/blog/${post.slug}`);