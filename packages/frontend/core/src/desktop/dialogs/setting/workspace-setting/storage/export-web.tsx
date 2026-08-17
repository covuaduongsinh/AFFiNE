import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { useExportWorkspaceSnapshot } from '@affine/core/components/hooks/affine/use-export-workspace-snapshot';
import type { Workspace } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { ExportIcon } from '@blocksuite/icons/rc';

interface WebExportPanelProps {
  workspace: Workspace;
}

/**
 * The web counterpart of {@link DesktopExportPanel}: the desktop backup writes
 * a SQLite `.affine` file, which the browser has no equivalent of, so here the
 * whole workspace goes out as a `.bs.zip` snapshot instead.
 */
export const WebExportPanel = ({ workspace }: WebExportPanelProps) => {
  const t = useI18n();
  const { exportSnapshot, exporting } = useExportWorkspaceSnapshot(workspace);

  return (
    <SettingRow name={t['Full Backup']()} desc={t['Full Backup Description']()}>
      <Button
        variant="primary"
        data-testid="export-workspace-snapshot"
        onClick={exportSnapshot}
        loading={exporting}
        disabled={exporting}
        prefix={<ExportIcon />}
      >
        {t['Full Backup']()}
      </Button>
    </SettingRow>
  );
};
