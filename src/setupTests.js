import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const intervalIds = new Set();
const timeoutIds = new Set();
const originalSetInterval = window.setInterval;
const originalClearInterval = window.clearInterval;
const originalSetTimeout = window.setTimeout;
const originalClearTimeout = window.clearTimeout;

window.setInterval = (...args) => {
  const id = originalSetInterval(...args);
  intervalIds.add(id);
  return id;
};

window.clearInterval = (id) => {
  intervalIds.delete(id);
  return originalClearInterval(id);
};

window.setTimeout = (...args) => {
  const id = originalSetTimeout(...args);
  timeoutIds.add(id);
  return id;
};

window.clearTimeout = (id) => {
  timeoutIds.delete(id);
  return originalClearTimeout(id);
};

afterEach(() => {
  cleanup();
  intervalIds.forEach((id) => originalClearInterval(id));
  timeoutIds.forEach((id) => originalClearTimeout(id));
  intervalIds.clear();
  timeoutIds.clear();
});
