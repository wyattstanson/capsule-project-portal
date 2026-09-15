/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API in production, e.g. https://capsule-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
