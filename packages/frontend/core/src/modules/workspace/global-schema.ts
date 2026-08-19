import { AIChatBlockSchema } from '@affine/core/blocksuite/ai/blocks/ai-chat-block/model';
import { TranscriptionBlockSchema } from '@affine/core/blocksuite/ai/blocks/transcription-block/model';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import { Schema } from '@blocksuite/affine/store';
import { ChessBoardBlockSchema } from '@blocksuite/chess-block-board';
import { ChessGameBlockSchema } from '@blocksuite/chess-block-game';

let _schema: Schema | null = null;
export function getAFFiNEWorkspaceSchema() {
  if (!_schema) {
    _schema = new Schema();

    _schema.register([
      ...AffineSchemas,
      AIChatBlockSchema,
      TranscriptionBlockSchema,
      // Without these, markdown import silently drops every chess block: the
      // importer validates snapshots against THIS schema, not the store
      // extensions the open-doc path uses.
      ChessBoardBlockSchema,
      ChessGameBlockSchema,
    ]);
  }

  return _schema;
}
