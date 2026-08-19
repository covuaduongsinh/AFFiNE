import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface CoachAuditEntry {
  ts: number;
  tool: string;
  allowed: boolean;
  reason?: string;
}

export type CoachAuditSink = (entry: CoachAuditEntry) => void;

export function createJsonlAuditSink(filePath: string): CoachAuditSink {
  return entry => {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      // Audit must never break a tool call.
    }
  };
}

export function memoryAuditSink(into: CoachAuditEntry[]): CoachAuditSink {
  return entry => {
    into.push(entry);
  };
}
