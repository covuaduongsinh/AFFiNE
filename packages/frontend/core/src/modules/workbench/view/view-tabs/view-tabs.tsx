import { IconButton } from '@affine/component';
import { CloseIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServiceOptional } from '@toeverything/infra';
import { type MouseEventHandler, useCallback } from 'react';

import { iconNameToIcon, type ViewIconName } from '../../constants';
import type { View } from '../../entities/view';
import { WorkbenchService } from '../../services/workbench';
import * as styles from './view-tabs.css';

const ViewTab = ({
  view,
  active,
  canClose,
  onActivate,
  onClose,
}: {
  view: View;
  active: boolean;
  canClose: boolean;
  onActivate: () => void;
  onClose: () => void;
}) => {
  const title = useLiveData(view.title$);
  const iconName = useLiveData(view.icon$) as ViewIconName;
  const icon = (iconName && iconNameToIcon[iconName]) || iconNameToIcon.doc;

  const handleClick: MouseEventHandler = useCallback(
    e => {
      e.stopPropagation();
      onActivate();
    },
    [onActivate]
  );

  const handleAuxClick: MouseEventHandler = useCallback(
    e => {
      if (e.button === 1 && canClose) {
        e.stopPropagation();
        onClose();
      }
    },
    [canClose, onClose]
  );

  const handleCloseClick: MouseEventHandler = useCallback(
    e => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  return (
    <div
      className={styles.tab}
      data-active={active}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      title={title || 'Untitled'}
    >
      <div className={styles.tabIcon}>{icon}</div>
      <span className={styles.tabTitle}>{title || 'Untitled'}</span>
      {canClose && (
        <IconButton
          size="16"
          className={styles.tabCloseButton}
          onClick={handleCloseClick}
          tooltip="Close tab"
        >
          <CloseIcon />
        </IconButton>
      )}
    </div>
  );
};

export const ViewTabs = () => {
  const workbenchService = useServiceOptional(WorkbenchService);
  const workbench = workbenchService?.workbench;
  const views = useLiveData(workbench?.views$);
  const activeView = useLiveData(workbench?.activeView$);

  const handleAddTab = useCallback(() => {
    if (!workbench) return;
    workbench.createView('tail', { pathname: '/all' }, true);
  }, [workbench]);

  if (!workbench || !views || views.length === 0) {
    return null;
  }

  return (
    <div className={styles.root}>
      <div className={styles.tabsList}>
        {views.map(view => (
          <ViewTab
            key={view.id}
            view={view}
            active={view === activeView}
            canClose={views.length > 1}
            onActivate={() => workbench.active(view)}
            onClose={() => workbench.close(view)}
          />
        ))}
      </div>
      <IconButton
        size="20"
        className={styles.tabAddButton}
        onClick={handleAddTab}
        tooltip="New tab"
      >
        <PlusIcon />
      </IconButton>
    </div>
  );
};
