export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_URL: string;
  STORAGE_QUOTA_BYTES: string;
  SESSION_SECRET: string;
};

export type Variables = {
  adminUserId?: number;
  adminEmail?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
