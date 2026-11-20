import type { FormEvent } from 'react';
import { TIME_CONTROL_LABELS, type RoomPeekInfo } from '@shared/protocol';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { formatRoomCode } from '../utils/format';

interface JoinPromptProps {
  code: string;
  pseudo: string;
  onChangePseudo: (value: string) => void;
  peekInfo: RoomPeekInfo | null;
  peekError: string | null;
  error: string | null;
  isBusy: boolean;
  connected: boolean;
  onJoin: () => void;
  onBackHome: () => void;
}

export function JoinPrompt({
  code,
  pseudo,
  onChangePseudo,
  peekInfo,
  peekError,
  error,
  isBusy,
  connected,
  onJoin,
  onBackHome,
}: JoinPromptProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onJoin();
  };

  const displayError = error ?? peekError;

  return (
    <main className="w-full max-w-[440px] mx-auto px-3 flex-1 flex flex-col justify-center">
      <div
        className="rounded-[16px] p-5 sm:p-6 flex flex-col gap-4"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-lg px-2.5 py-1 font-mono text-xs font-semibold tracking-[0.12em]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-main)',
            }}
          >
            #{formatRoomCode(code)}
          </span>
          {peekInfo && (
            <span
              className="rounded-lg px-2.5 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            >
              {TIME_CONTROL_LABELS[peekInfo.timeControl]}
            </span>
          )}
        </div>

        {displayError ? (
          <>
            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Salon indisponible
              </h1>
              <p
                className="text-sm mt-1"
                style={{ color: 'var(--danger-color)' }}
              >
                {displayError}
              </p>
            </div>
            <button
              type="button"
              onClick={onBackHome}
              className="tactile-btn inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour à l’accueil</span>
            </button>
          </>
        ) : peekInfo?.isFull ? (
          <>
            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Ce salon est complet
              </h1>
              <p
                className="text-sm mt-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Deux joueurs sont déjà installés dans cette partie.
              </p>
            </div>
            <button
              type="button"
              onClick={onBackHome}
              className="tactile-btn inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour à l’accueil</span>
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {peekInfo?.hostPseudo
                  ? `${peekInfo.hostPseudo} vous invite à un duel`
                  : 'Rejoindre le duel privé'}
              </h1>
              <p
                className="text-xs sm:text-sm mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Aucun compte requis — entrez simplement votre pseudo.
              </p>
            </div>

            <div>
              <label
                htmlFor="join-pseudo-input"
                className="block text-xs font-semibold mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Votre pseudo
              </label>
              <input
                id="join-pseudo-input"
                type="text"
                maxLength={20}
                autoFocus
                value={pseudo}
                onChange={(e) => onChangePseudo(e.target.value)}
                placeholder="Ex. Théo"
                className="tactile-input w-full rounded-[10px] px-3.5 py-2.5 text-base font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-main)',
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBackHome}
                className="tactile-btn rounded-[10px] px-3.5 py-2.5 text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                Retour
              </button>
              <button
                type="submit"
                disabled={!connected || isBusy || !peekInfo}
                className="tactile-btn flex-1 rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                <span>Rejoindre la partie</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
