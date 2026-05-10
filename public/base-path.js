/**
 * base-path.js — base-path awareness for TAU_BASE_PATH deployments.
 *
 * `window.TAU_BASE_PATH` is injected into index.html by the server when
 * TAU_BASE_PATH is set (e.g. "/workbench"). Falls back to "" (root).
 *
 * Usage:
 *   import { BASE, api } from './base-path.js';
 *   fetch(api('/api/projects'))  // → fetch('/workbench/api/projects')
 *   new WebSocket(`${wsScheme}://${location.host}${BASE}/ws`)
 */

export const BASE = window.TAU_BASE_PATH || "";

/** Prefix an absolute path with the base path. */
export const api = (path) => `${BASE}${path}`;
