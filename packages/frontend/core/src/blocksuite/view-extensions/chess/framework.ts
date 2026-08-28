import type { FrameworkProvider } from '@toeverything/infra';

let chessFramework: FrameworkProvider | undefined;

export function bindChessFramework(framework?: FrameworkProvider) {
  chessFramework = framework;
}

export function getChessFramework(): FrameworkProvider | undefined {
  return chessFramework;
}
