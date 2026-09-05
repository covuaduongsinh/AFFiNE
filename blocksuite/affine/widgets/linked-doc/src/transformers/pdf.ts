import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  PdfAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import type { Store } from '@blocksuite/store';

import { download } from './utils.js';

export interface PdfExportOptions {
  chessDiagramStyle?: 'vector' | 'font';
}

async function exportDoc(doc: Store, options?: PdfExportOptions) {
  const provider = doc.provider;
  const middlewares = [
    docLinkBaseURLMiddleware(doc.workspace.id),
    titleMiddleware(doc.workspace.meta.docMetas),
    embedSyncedDocMiddleware('content'),
  ];
  if (options?.chessDiagramStyle) {
    middlewares.push(({ slots, adapterConfigs }) => {
      const sub = slots.beforeExport.subscribe(() => {
        adapterConfigs.set('chessDiagramStyle', options.chessDiagramStyle);
      });
      return () => sub.unsubscribe();
    });
  }
  const job = doc.getTransformer(middlewares);
  const snapshot = job.docToSnapshot(doc);
  if (!snapshot) {
    return;
  }
  const adapter = new PdfAdapter(job, provider);
  const { file } = await adapter.fromDocSnapshot({
    snapshot,
    assets: job.assetsManager,
  });
  download(file.blob, file.fileName);
}

export const PdfTransformer = {
  exportDoc,
};
