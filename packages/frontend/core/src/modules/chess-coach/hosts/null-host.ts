import type {
  CoachHost,
  CoachHubInfo,
  CoachProvider,
  CoachStatus,
} from '../types';

export class NullCoachHost implements CoachHost {
  readonly id = 'null';

  async status(): Promise<CoachStatus> {
    return {
      available: false,
      provider: 'none',
      providers: { claude: false, grok: false, api: false },
      claudePath: null,
      grokPath: null,
      api: null,
      hub: null,
    };
  }

  async hubInfo(): Promise<CoachHubInfo | null> {
    return null;
  }

  async query(): Promise<void> {}
  async stop(): Promise<void> {}
  async setProvider(_provider: CoachProvider): Promise<void> {}
  async saveApiKey(): Promise<void> {}
  async clearApiKey(): Promise<void> {}
  async replyTool(): Promise<void> {}
  subscribe(): () => void {
    return () => {};
  }
}
