import { notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  getAFFiNEWorkspaceSchema,
  type Workspace,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { ZipTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { useState } from 'react';

/**
 * Exports every doc of a workspace, with its blobs, as a `.bs.zip` snapshot.
 *
 * This is the only whole-workspace backup available on web: the `.affine`
 * SQLite export needs the desktop app. The zip carries doc content, titles and
 * assets, but not the root doc, so a restore rebuilds the docs without their
 * folder tree, tags or favorites.
 */
export const useExportWorkspaceSnapshot = (workspace: Workspace) => {
  const t = useI18n();
  const [exporting, setExporting] = useState(false);

  const exportSnapshot = useAsyncCallback(async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      track.$.settingsPanel.workspace.export({ type: 'workspace-snapshot' });

      // A cloud workspace only holds what this client happens to have synced,
      // so pull everything down before reading it.
      if (workspace.flavour !== 'local') {
        await workspace.engine.blob.fullDownload();
        await workspace.engine.doc.waitForSynced();
      }

      const collection = workspace.docCollection;
      const docs = Array.from(collection.docs.values());
      // A doc that was never opened has an empty in-memory yjs doc; loading it
      // connects it to the sync engine, and only then does it hold its blocks.
      docs.forEach(doc => doc.load());
      await Promise.all(
        docs.map(doc => workspace.engine.doc.waitForDocReady(doc.id))
      );

      await ZipTransformer.exportDocs(
        collection,
        getAFFiNEWorkspaceSchema(),
        docs.map(doc => doc.getStore())
      );
      notify.success({ title: t['Export success']() });
    } catch (e: any) {
      notify.error({ title: t['Export failed'](), message: e.message });
    } finally {
      setExporting(false);
    }
  }, [exporting, t, workspace]);

  return { exportSnapshot, exporting };
};
