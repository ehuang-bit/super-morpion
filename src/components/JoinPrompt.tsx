import { useRef, useState, type FormEvent } from 'react';
import { validateGuestPseudo } from '@shared/authValidation';
import {
  TIME_CONTROL_LABELS,
  type AuthUser,
  type RoomPeekInfo,
} from '@shared/protocol';
import { ArrowLeft, ArrowRight, Eye, UserCheck, Users } from 'lucide-react';
import { formatRoomCode } from '../utils/format';

export interface JoinPromptProps {
  code: string;
  user?: AuthUser | null;
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
  user = null,
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
  const [pseudoError, setPseudoError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      const check = validateGuestPseudo(pseudo);
      if (!check.ok) {
        setPseudoError(check.error);
        inputRef.current?.focus();
        return;
      }
    }
    setPseudoError(null);
    onJoin();
  };

  const displayError = error ?? peekError;
  const is2v2 = peekInfo?.mode === '2v2';
  const isSpectatorJoin = Boolean(peekInfo?.isFull);
  const spectatorCount = peekInfo?.spectatorCount ?? 0;

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
        <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {is2v2 && (
                <span
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                    border: '1px solid var(--accent-active)',
                  }}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {isSpectatorJoin
                      ? '2v2'
                      : `2v2 · ${peekInfo.playerCount}/${peekInfo.maxPlayers} joueurs`}
                  </span>
                </span>
              )}
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
            </div>
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
        ) : isSpectatorJoin && peekInfo ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                  border: '1px solid var(--accent-active)',
                }}
              >
                {peekInfo.phase === 'playing' && (
                  <span className="live-dot" aria-hidden="true" />
                )}
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {peekInfo.phase === 'playing'
                    ? 'Partie en cours'
                    : 'Salon complet · Mode spectateur'}
                </span>
              </span>
              {spectatorCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-main)',
                  }}
                >
                  <span>
                    {spectatorCount} spectateur{spectatorCount > 1 ? 's' : ''}
                  </span>
                </span>
              )}
            </div>

            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Regarder la partie en direct
              </h1>
              <p
                className="text-sm mt-1 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {is2v2
                  ? 'Les 4 joueurs sont en place — rejoins les gradins pour suivre ce 2v2 coup par coup.'
                  : 'Les deux joueurs sont déjà en place — rejoins les gradins pour suivre le duel coup par coup.'}
              </p>
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
                type="button"
                onClick={onJoin}
                disabled={!connected || isBusy}
                className="tactile-btn flex-1 rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                <Eye className="w-4 h-4" />
                <span>Regarder en direct</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {is2v2
                  ? peekInfo?.hostPseudo
                    ? `${peekInfo.hostPseudo} t’invite en 2v2`
                    : 'Rejoindre le salon 2v2'
                  : peekInfo?.hostPseudo
                    ? `${peekInfo.hostPseudo} vous invite à un duel`
                    : 'Rejoindre le duel privé'}
              </h1>
              <p
                className="text-xs sm:text-sm mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {user
                  ? 'Prêt à entrer dans le salon.'
                  : 'Aucun compte requis — entre ton pseudo pour rejoindre.'}
              </p>
            </div>

            {user ? (
              <div
                className="rounded-[10px] px-3 py-2.5 flex items-center gap-2 text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--x-surface)',
                  color: 'var(--x-color)',
                  border: '1px solid color-mix(in srgb, var(--x-color) 35%, transparent)',
                }}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">{user.gameName || user.username}</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="join-pseudo-input"
                    className="block text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Votre pseudo <span style={{ color: 'var(--danger-color)' }}>*</span>
                  </label>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Obligatoire
                  </span>
                </div>
                <input
                  ref={inputRef}
                  id="join-pseudo-input"
                  type="text"
                  required
                  maxLength={20}
                  autoFocus
                  value={pseudo}
                  aria-invalid={Boolean(pseudoError)}
                  onChange={(e) => {
                    onChangePseudo(e.target.value);
                    if (pseudoError) setPseudoError(null);
                  }}
                  placeholder="Ex. Théo"
                  className="tactile-input w-full rounded-[10px] px-3.5 py-2.5 text-base font-medium"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: `1px solid ${pseudoError ? 'var(--danger-color)' : 'var(--border-main)'}`,
                  }}
                />
                {pseudoError && (
                  <p className="mt-1 text-xs font-medium" style={{ color: 'var(--danger-color)' }}>
                    {pseudoError}
                  </p>
                )}
              </div>
            )}

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
