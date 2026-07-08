import { factory } from "ulid";

/**
 * ulid パッケージ(v2.3.0)既定の PRNG 自動検出は `typeof window !== "undefined"` でしか
 * ブラウザ Crypto を検出せず、Workers ランタイム(window が存在しない)では Node の
 * `crypto` モジュール(browser フィールドで空スタブに差し替えられている)へフォールバックし
 * `nodeCrypto.randomBytes is not a function` で例外になる。Web Crypto を直接使う
 * PRNG を明示的に渡すことでこの自動検出を迂回する。
 */
const workersPrng = (): number => {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xff;
};
const ulid = factory(workersPrng);

/** §5.3: アップロード許可拡張子(ホワイトリスト)。 */
export const ALLOWED_EXTENSIONS = ["pdf", "docx", "xlsx", "pptx", "csv", "txt"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

/**
 * 拡張子ごとに許容する MIME(ブラウザ/OS差異を吸収するため複数許容)。
 * 先頭の値が DB に保存する正規の content_type(§10: ユーザー入力を Content-Type として
 * そのまま信用・保存しない — 拡張子から導出した正規値のみを保存する)。
 */
const MIME_BY_EXTENSION: Record<AllowedExtension, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  txt: ["text/plain"],
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // §5.3: 1 ファイル 50MB 上限

export const extractExtension = (fileName: string): string => {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
};

export const isAllowedExtension = (ext: string): ext is AllowedExtension =>
  (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);

export const isAllowedMimeForExtension = (ext: AllowedExtension, mimeType: string): boolean =>
  MIME_BY_EXTENSION[ext].includes(mimeType.toLowerCase());

/** DB に保存する正規の Content-Type。アップロード時に受け取った MIME 文字列は信用せず、拡張子から導出する。 */
export const canonicalContentType = (ext: AllowedExtension): string => MIME_BY_EXTENSION[ext][0];

/** §5.3: R2 キーはサーバ生成の ULID。元ファイル名(日本語含む)はキーに使わず DB のみに保持する。 */
export const generateR2Key = (ext: AllowedExtension, now: Date = new Date()): string =>
  `documents/${now.getFullYear()}/${ulid()}.${ext}`;

export const getStorageUsageBytes = async (db: D1Database): Promise<number> => {
  const row = await db.prepare(`SELECT COALESCE(SUM(file_size), 0) AS total FROM documents`).first<{
    total: number;
  }>();
  return row?.total ?? 0;
};

/** §9.2: SUM(file_size) + 新規サイズ がクォータを超える場合は書き込み前に拒否する。 */
export const wouldExceedQuota = async (
  db: D1Database,
  quotaBytes: number,
  newFileSize: number
): Promise<boolean> => {
  const used = await getStorageUsageBytes(db);
  return used + newFileSize > quotaBytes;
};

const asciiFallbackFileName = (fileName: string): string => {
  const safe = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\r\n\\]/g, "_");
  return safe.trim() === "" ? "file" : safe;
};

/**
 * §10: ダウンロード応答の Content-Disposition に元ファイル名を安全に埋め込む。
 * `"` や改行によるヘッダインジェクションを防ぎ、日本語ファイル名は RFC 5987 の filename* で表現する。
 */
export const contentDispositionHeader = (
  fileName: string,
  disposition: "inline" | "attachment" = "inline"
): string => {
  const asciiFallback = asciiFallbackFileName(fileName);
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};
