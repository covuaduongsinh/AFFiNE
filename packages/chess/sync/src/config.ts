export type ChessSyncConfig = {
  host: string;
  port: number;
  dataDir: string;
  jwtSecret?: string;
};

export function loadConfig(
  options: Partial<ChessSyncConfig> = {}
): ChessSyncConfig {
  return {
    host: options.host ?? process.env.CHESS_SYNC_HOST ?? '127.0.0.1',
    port:
      options.port ??
      Number.parseInt(process.env.CHESS_SYNC_PORT ?? '3010', 10),
    dataDir:
      options.dataDir ?? process.env.CHESS_SYNC_DATA_DIR ?? './data/chess-sync',
    jwtSecret: options.jwtSecret,
  };
}
