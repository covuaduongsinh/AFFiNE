import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { ImportCommitService } from '@affine/core/desktop/dialogs/import/commit-service';
import { commitNativeImport } from '@affine/core/desktop/dialogs/import/native-backend';
import {
  filterWebImportFiles,
  obsidianWebImportLimits,
  preflightWebFilesImport,
  preflightWebZipImport,
} from '@affine/core/desktop/dialogs/import/web-limits';
import { DebugLogger } from '@affine/debug';
import { snapshotFile } from '@blocksuite/affine/shared/utils';
import {
  BearTransformer,
  type ImportWarning,
  isIgnoredObsidianPath,
  MarkdownTransformer,
  NotionHtmlTransformer,
  ObsidianTransformer,
  Unzip,
} from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import type { ExplorerIconService } from '../../explorer-icon/services/explorer-icon';
import type { OrganizeService } from '../../organize';
import type { TagService } from '../../tag';
import type { WorkspaceService } from '../../workspace';
import { getAFFiNEWorkspaceSchema } from '../../workspace';

const logger = new DebugLogger('import');

export type ImportRunContext = {
  signal?: AbortSignal;
  onProgress?: (progress: { completed: number; total: number }) => void;
};

export class ImportService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly organizeService: OrganizeService,
    private readonly explorerIconService: ExplorerIconService,
    private readonly tagService: TagService
  ) {
    super();
  }

  async importMarkdownZip(file: File, context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({ organize: true });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('markdownZip', file, commitService, context);
    }

    await preflightWebZipImport(file);
    const snapshot = await snapshotFile(file);
    const { batch } = await MarkdownTransformer.planMarkdownZip({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      imported: snapshot,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    return commitService.commitBatch(batch);
  }

  async importNotionZip(file: File, context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({
      organize: true,
      explorerIcon: true,
    });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('notionZip', file, commitService, context);
    }

    await preflightWebZipImport(file);
    const snapshot = await snapshotFile(file);
    const format = await detectNotionZipFormat(snapshot);
    if (format === 'markdown') {
      const { batch } = await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema: getAFFiNEWorkspaceSchema(),
        imported: snapshot,
        extensions: getStoreManager().config.init().value.get('store'),
      });
      return commitService.commitBatch(batch);
    }
    const { batch } = await NotionHtmlTransformer.planNotionHtmlZip({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      imported: snapshot,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    return commitService.commitBatch(batch);
  }

  async importObsidianVault(files: File[], context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({
      organize: true,
      explorerIcon: true,
      tag: true,
      preserveNestedTagNames: true,
    });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('obsidian', files, commitService, context);
    }

    // A picked vault folder is mostly not the vault: `.git`, plugin caches and
    // Dropbox conflict copies dwarf the notes. Dropping them here keeps the
    // preflight honest and stops the reader from pulling hundreds of megabytes
    // of junk into memory.
    const vaultFiles = files.filter(
      file => !isIgnoredObsidianPath(file.webkitRelativePath || file.name)
    );
    const { files: importableFiles, warnings: limitWarnings } =
      filterWebImportFiles(vaultFiles, obsidianWebImportLimits);
    await preflightWebFilesImport(importableFiles, obsidianWebImportLimits);

    const { files: snapshots, warnings: readWarnings } =
      await snapshotReadableFiles(importableFiles);
    if (!snapshots.length) {
      throw new Error('No readable files were found in the selected folder.');
    }

    const warnings: ImportWarning[] = [...limitWarnings, ...readWarnings];
    const docIds: string[] = [];
    let rootFolderId: string | undefined;

    for await (const batch of ObsidianTransformer.planObsidianVaultBatches({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      importedFiles: snapshots,
      extensions: getStoreManager().config.init().value.get('store'),
    })) {
      if (context?.signal?.aborted) {
        throw new DOMException('Import cancelled', 'AbortError');
      }
      context?.onProgress?.(batch.progress ?? { completed: 0, total: 0 });
      const result = await commitService.commitBatch(batch);
      docIds.push(...result.docIds);
      warnings.push(...result.warnings);
      rootFolderId ??= result.rootFolderId;
    }

    return { docIds, rootFolderId, warnings };
  }

  async importBearBackup(file: File, context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({
      organize: true,
      tag: true,
    });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('bearZip', file, commitService, context);
    }

    await preflightWebZipImport(file);
    const snapshot = await snapshotFile(file);
    const { batch } = await BearTransformer.planBearBackup({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      imported: snapshot,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    return commitService.commitBatch(batch);
  }

  async importOneNote(file: File, context?: ImportRunContext) {
    if (!BUILD_CONFIG.isElectron) {
      throw new Error('OneNote import is only available in the desktop app.');
    }
    const commitService = this.createCommitService({
      organize: true,
    });
    return commitNativeImport('oneNote', file, commitService, context);
  }

  private createCommitService(options: {
    organize?: boolean;
    explorerIcon?: boolean;
    tag?: boolean;
    preserveNestedTagNames?: boolean;
  }) {
    return new ImportCommitService({
      collection: this.workspaceService.workspace.docCollection,
      schema: getAFFiNEWorkspaceSchema(),
      extensions: getStoreManager().config.init().value.get('store'),
      organizeService: options.organize ? this.organizeService : undefined,
      explorerIconService: options.explorerIcon
        ? this.explorerIconService
        : undefined,
      tagService: options.tag ? this.tagService : undefined,
      preserveNestedTagNames: options.preserveNestedTagNames,
      logger,
    });
  }
}

async function detectNotionZipFormat(file: File): Promise<'markdown' | 'html'> {
  const unzip = new Unzip();
  await unzip.load(file);
  let hasHtml = false;
  for (const entry of unzip) {
    const lower = entry.path.toLowerCase();
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.html') && !lower.endsWith('/index.html')) {
      hasHtml = true;
    }
  }
  if (hasHtml) return 'html';
  throw new Error('No Notion Markdown or HTML pages found in the archive');
}

async function snapshotReadableFiles(files: File[]) {
  const snapshots: File[] = [];
  const warnings: ImportWarning[] = [];
  for (const file of files) {
    try {
      snapshots.push(await snapshotFile(file));
    } catch (error) {
      const sourcePath = file.webkitRelativePath || file.name;
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: 'file-unreadable',
        message: `Skipped unreadable file: ${sourcePath}. ${reason}`,
        sourcePath,
      });
    }
  }
  return { files: snapshots, warnings };
}
