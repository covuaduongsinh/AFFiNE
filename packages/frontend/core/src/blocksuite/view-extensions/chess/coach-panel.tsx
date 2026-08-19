import { I18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import {
  ChessCoachService,
  type CoachProvider,
} from '../../../modules/chess-coach';
import { FeatureFlagService } from '../../../modules/feature-flag';
import * as styles from './coach-panel.css';

export const ChessCoachPanel = () => {
  const flags = useService(FeatureFlagService);
  const enabled = useLiveData(flags.flags.enable_chess_coach.$);
  const coach = useService(ChessCoachService);
  const session = coach.session;
  const messages = useLiveData(session.messages$);
  const busy = useLiveData(session.busy$);
  const status = useLiveData(session.status$);
  const hubHint = useLiveData(session.hubHint$);
  const [draft, setDraft] = useState('');
  const [apiProvider, setApiProvider] = useState<
    'openrouter' | 'openai' | 'xai'
  >('openrouter');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    session.refresh().catch(() => {});
  }, [session]);

  const send = useCallback(() => {
    const text = draft;
    setDraft('');
    session.send(text).catch(() => {});
  }, [draft, session]);

  if (!enabled) {
    return null;
  }

  const canChat = status.available && !busy;
  const selected: CoachProvider =
    status.provider === 'none' ? 'claude' : status.provider;
  const providers = status.providers ?? {
    claude: false,
    grok: false,
    api: false,
  };
  const subscriptionReady =
    (selected === 'claude' && providers.claude) ||
    (selected === 'grok' && providers.grok);
  return (
    <div className={styles.root} data-testid="chess-coach-panel">
      <div className={styles.title}>
        {I18n.t('com.affine.chess.coach.title')}
      </div>
      <div className={styles.row}>
        <label htmlFor="chess-coach-provider">
          {I18n.t('com.affine.chess.coach.provider')}
        </label>
        <select
          id="chess-coach-provider"
          className={styles.select}
          data-testid="chess-coach-provider"
          value={selected}
          onChange={event => {
            session
              .setProvider(event.target.value as CoachProvider)
              .catch(() => {});
          }}
        >
          <option value="claude">
            {I18n.t('com.affine.chess.coach.provider.claude')}
          </option>
          <option value="grok">
            {I18n.t('com.affine.chess.coach.provider.grok')}
          </option>
          <option value="api">
            {I18n.t('com.affine.chess.coach.provider.api')}
          </option>
        </select>
      </div>
      {selected === 'api' && (
        <>
          <div className={styles.row}>
            <select
              className={styles.select}
              data-testid="chess-coach-api-provider"
              value={apiProvider}
              onChange={event =>
                setApiProvider(event.target.value as typeof apiProvider)
              }
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="xai">xAI</option>
            </select>
            <input
              className={styles.secret}
              data-testid="chess-coach-api-key"
              type="password"
              autoComplete="off"
              placeholder={I18n.t('com.affine.chess.coach.apiKey')}
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
            />
            <button
              className={styles.button}
              data-testid="chess-coach-api-save"
              disabled={!apiKey.trim()}
              onClick={() => {
                session
                  .saveApiKey({ provider: apiProvider, apiKey: apiKey.trim() })
                  .then(() => setApiKey(''))
                  .catch(() => {});
              }}
            >
              {I18n.t('com.affine.chess.coach.apiSave')}
            </button>
            <button
              className={styles.button}
              data-testid="chess-coach-api-clear"
              disabled={!status.api}
              onClick={() => {
                session.clearApiKey().catch(() => {});
              }}
            >
              {I18n.t('com.affine.chess.coach.apiClear')}
            </button>
          </div>
          {status.api && (
            <div className={styles.hint} data-testid="chess-coach-api-saved">
              {I18n.t('com.affine.chess.coach.apiSaved')} ({status.api.provider}{' '}
              / {status.api.model})
            </div>
          )}
        </>
      )}
      {selected !== 'api' && subscriptionReady && (
        <div className={styles.hint} data-testid="chess-coach-subscription">
          {I18n.t('com.affine.chess.coach.subscriptionReady')}
        </div>
      )}
      {selected !== 'api' && !subscriptionReady && (
        <div
          className={styles.hint}
          data-testid="chess-coach-subscription-missing"
        >
          {selected === 'grok'
            ? I18n.t('com.affine.chess.coach.subscriptionMissing.grok')
            : I18n.t('com.affine.chess.coach.subscriptionMissing.claude')}
        </div>
      )}
      {!status.available && selected === 'api' && (
        <div className={styles.hint} data-testid="chess-coach-unavailable">
          {I18n.t('com.affine.chess.coach.unavailable')}
        </div>
      )}
      {hubHint && (
        <div className={styles.hint} data-testid="chess-coach-cli-hint">
          {I18n.t('com.affine.chess.coach.cliHint')}: {hubHint}
        </div>
      )}
      <div className={styles.messages} data-testid="chess-coach-messages">
        {messages.map(message => (
          <div
            key={message.id}
            className={styles.message}
            data-role={message.role}
          >
            <div className={styles.role}>{message.role}</div>
            {message.text}
          </div>
        ))}
      </div>
      <div className={styles.composer}>
        <textarea
          className={styles.input}
          data-testid="chess-coach-input"
          value={draft}
          disabled={!status.available}
          placeholder={I18n.t('com.affine.chess.coach.placeholder')}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (canChat) send();
            }
          }}
        />
        {busy ? (
          <button
            className={styles.button}
            data-testid="chess-coach-stop"
            onClick={() => {
              session.stop().catch(() => {});
            }}
          >
            {I18n.t('com.affine.chess.coach.stop')}
          </button>
        ) : (
          <button
            className={styles.button}
            data-testid="chess-coach-send"
            disabled={!canChat || !draft.trim()}
            onClick={send}
          >
            {I18n.t('com.affine.chess.coach.send')}
          </button>
        )}
      </div>
    </div>
  );
};
