export type ChessSyncConfig = {
  host: string;
  port: number;
  dataDir: string;
  jwtSecret?: string;
  /**
   * The address people actually type, when a proxy sits in front.
   *
   * Absolute URLs get written into the database — an avatar upload stores one
   * — and they are built from the request otherwise. Behind a proxy that means
   * building them from a header the client controls, and one wrong guess
   * leaves `http://` in the data for good, which a browser then blocks as
   * mixed content. Configuring it removes the guess.
   */
  publicOrigin?: string;
  /**
   * Emails allowed to sign in. Empty means anyone.
   *
   * Signing in creates the account when it does not exist, which is fine for a
   * server on loopback and is an open door on a public address. This is the
   * smallest thing that closes it.
   */
  allowedEmails: string[];
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
    publicOrigin: (
      options.publicOrigin ??
      process.env.CHESS_SYNC_PUBLIC_ORIGIN ??
      ''
    ).replace(/\/$/, ''),
    allowedEmails: (
      options.allowedEmails ??
      (process.env.CHESS_SYNC_ALLOWED_EMAILS ?? '').split(',')
    )
      .map(entry => entry.trim().toLowerCase())
      .filter(Boolean),
  };
}
