import type { Game } from '@blocksuite/chess-core';
import {
  type GameScan,
  type MoveLabel,
  parseGameScan,
  serializeGameScan,
} from '@blocksuite/chess-engine';
import { useLiveData, useServiceOptional } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChessEngineService } from '../../../modules/chess-engine';
import { pathKey, uciToArrow } from './analysis-ui';

export function useChessAnalysis(
  blockId: string,
  options: {
    storedJson?: string;
    persistScan?: (json: string) => void;
  } = {}
) {
  const { storedJson, persistScan } = options;
  const service = useServiceOptional(ChessEngineService);
  const engine = service?.engine;
  const status = useLiveData(engine?.status$) ?? 'unavailable';
  const available = useLiveData(engine?.available$) ?? false;
  const activeId = useLiveData(engine?.activeBlock$);
  const lastInfo = useLiveData(engine?.lastInfo$);
  const progress = useLiveData(engine?.scanProgress$);
  const [live, setLive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scan, setScan] = useState<GameScan | null>(() =>
    parseGameScan(storedJson)
  );

  useEffect(() => {
    setScan(parseGameScan(storedJson));
  }, [storedJson]);

  const isActive = activeId === blockId;

  const activate = useCallback(() => {
    engine?.setActiveBlock(blockId);
  }, [blockId, engine]);

  const startLive = useCallback(() => {
    if (!engine) return;
    setLive(true);
    engine.setActiveBlock(blockId);
  }, [blockId, engine]);

  const requestAnalyze = useCallback(
    (fen: string) => {
      engine?.analyzePosition({ blockId, fen });
    },
    [blockId, engine]
  );

  const stop = useCallback(() => {
    setLive(false);
    engine?.stop().catch(() => {});
  }, [engine]);

  const runScan = useCallback(
    (game: Game, depth?: number) => {
      if (!engine) return;
      engine.setActiveBlock(blockId);
      setLive(false);
      setScanning(true);
      setScanError(null);
      engine
        .scan(game, { depth })
        .then(report => {
          setScan(report);
          persistScan?.(serializeGameScan(report));
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'scan failed';
          if (message.includes('abort')) return;
          setScanError(message);
        })
        .finally(() => {
          setScanning(false);
        });
    },
    [blockId, engine, persistScan]
  );

  const pv0 = lastInfo?.pv[0];
  const engineArrow = useMemo(() => {
    if (!isActive || !live || !pv0) return null;
    return uciToArrow(pv0);
  }, [isActive, live, pv0]);

  const labels = useMemo(() => {
    const map = new Map<string, MoveLabel>();
    if (!scan) return map;
    for (const node of scan.nodes) {
      map.set(pathKey(node.path), node.label);
    }
    return map;
  }, [scan]);

  return {
    engine,
    status,
    available,
    lastInfo: isActive ? lastInfo : null,
    progress: isActive || scanning ? progress : null,
    isActive,
    live,
    scanning,
    scanError,
    scan,
    labels,
    engineArrow,
    activate,
    startLive,
    requestAnalyze,
    stop,
    runScan,
  };
}
