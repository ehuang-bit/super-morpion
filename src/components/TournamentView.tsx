import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { validateGuestPseudo } from '@shared/authValidation';
import type {
  RoomSnapshot,
  TimeControl,
  TournamentMatch,
  TournamentParticipant,
  TournamentSize,
  TournamentSnapshot,
} from '@shared/protocol';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Copy,
  Crown,
  Eye,
  Play,
  QrCode as QrCodeIcon,
  RefreshCw,
  ShieldAlert,
  Swords,
  Trophy,
  UserMinus,
  Users,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { normalizeRoomCode } from '../utils/format';
import { haptics } from '../utils/haptics';
import { SMOOTH_EASE } from '../utils/motion';
import { Confetti } from './Confetti';
import { QrCode } from './QrCode';

interface TournamentViewProps {
  playerId: string;
  pseudo: string;
  onChangePseudo: (value: string) => void;
  hasAccount: boolean;
  snapshot: TournamentSnapshot | null;
  loading: boolean;
  busyMatchId: string | null;
  error: string | null;
  onClearError: () => void;
  onCreate: (params: {
    name: string;
    size: TournamentSize;
    timeControl: TimeControl;
    pseudo: string;
  }) => Promise<TournamentSnapshot | null>;
  onJoin: (params: {
    code: string;
    pseudo: string;
  }) => Promise<TournamentSnapshot | null>;
  onRefresh: () => void;
  onLeaveOrKick: (targetPlayerId?: string) => Promise<boolean>;
  onStart: () => Promise<boolean>;
  onPlayMatch: (matchId: string) => Promise<{
    roomCode: string;
    snapshot: RoomSnapshot;
    version: number;
  } | null>;
  onWatchRoom: (roomCode: string) => void;
  onAdvanceForfeit: (matchId: string, winnerId: string) => Promise<boolean>;
  onExitHub: () => void;
  onBackToPlay: () => void;
}

const SIZES: readonly TournamentSize[] = [4, 8, 16];
const TIME_CONTROLS: readonly TimeControl[] = ['rapid', 'blitz', 'unlimited'];

function findParticipantById(
  list: TournamentParticipant[],
  id: string | null,
): TournamentParticipant | null {
  if (!id) return null;
  return list.find((p) => p.id === id) ?? null;
}

export function TournamentView({
  playerId,
  pseudo,
  onChangePseudo,
  hasAccount,
  snapshot,
  loading,
  busyMatchId,
  error,
  onClearError,
  onCreate,
  onJoin,
  onRefresh,
  onLeaveOrKick,
  onStart,
  onPlayMatch,
  onWatchRoom,
  onAdvanceForfeit,
  onExitHub,
  onBackToPlay,
}: TournamentViewProps) {
  const { t, translateTimeControl, translateRoundKey } = useI18n();

  // Create form state
  const [nameInput, setNameInput] = useState('');
  const [size, setSize] = useState<TournamentSize>(8);
  const [pseudoError, setPseudoError] = useState<string | null>(null);
  const pseudoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hasAccount) setPseudoError(null);
  }, [hasAccount]);

  const ensureTournamentPseudo = (): boolean => {
    if (hasAccount) {
      setPseudoError(null);
      return true;
    }
    const check = validateGuestPseudo(pseudo);
    if (!check.ok) {
      setPseudoError(check.error);
      pseudoInputRef.current?.focus();
      pseudoInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      haptics.tap();
      return false;
    }
    setPseudoError(null);
    return true;
  };
  const [timeControl, setTimeControl] = useState<TimeControl>('rapid');

  // Join form state
  const [codeInput, setCodeInput] = useState('');

  // Lobby invite helpers
  const [copiedType, setCopiedType] = useState<'link' | 'code' | null>(null);
  const [showQr, setShowQr] = useState(true);

  // Bracket helpers
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
  const [forfeitOpenMatchId, setForfeitOpenMatchId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRound('all');
    setForfeitOpenMatchId(null);
  }, [snapshot?.code]);

  const inviteUrl = useMemo(() => {
    if (!snapshot || typeof window === 'undefined') return '';
    return `${window.location.origin}/tournoi/${snapshot.code}`;
  }, [snapshot]);

  const copyText = async (text: string, kind: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(kind);
      haptics.tap();
      window.setTimeout(() => {
        setCopiedType((curr) => (curr === kind ? null : curr));
      }, 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  // ==================== STATE 1: HUB (CREATE OR JOIN) ====================
  if (!snapshot) {
    const cleanCode = normalizeRoomCode(codeInput);

    return (
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-5 py-2 sm:py-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-[10px] inline-flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                  border: '1px solid var(--accent-active)',
                }}
              >
                <Crown className="w-4 h-4" />
              </span>
              <h1
                className="text-xl sm:text-2xl font-extrabold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('trn.title')}
              </h1>
            </div>
            <p
              className="text-xs sm:text-sm mt-1.5 max-w-[600px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('trn.subtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToPlay}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('common.back')}</span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-[11px] px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger-color)',
              border: '1px solid var(--danger-color)',
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="underline text-[11px] shrink-0"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] gap-4 items-start">
          {/* Create Tournament Card */}
          <section
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                className="text-base font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('trn.createTitle')}
              </h2>
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                }}
              >
                4 · 8 · 16
              </span>
            </div>

            {!hasAccount && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="trn-pseudo-input"
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('play.pseudoGuest')}{' '}
                    <span style={{ color: 'var(--danger-color)' }}>*</span>
                  </label>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Obligatoire
                  </span>
                </div>
                <input
                  ref={pseudoInputRef}
                  id="trn-pseudo-input"
                  type="text"
                  required
                  maxLength={20}
                  value={pseudo}
                  aria-invalid={Boolean(pseudoError)}
                  onChange={(e) => {
                    onChangePseudo(e.target.value);
                    if (pseudoError && validateGuestPseudo(e.target.value).ok) {
                      setPseudoError(null);
                    }
                  }}
                  placeholder={t('play.pseudoPlaceholder')}
                  className="tactile-input w-full rounded-[10px] px-3 py-2 text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: `1px solid ${pseudoError ? 'var(--danger-color)' : 'var(--border-main)'}`,
                  }}
                />
                {pseudoError && (
                  <p className="text-xs font-medium" style={{ color: 'var(--danger-color)' }}>
                    {pseudoError}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trn-name-input"
                className="text-xs font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('trn.nameLabel')}
              </label>
              <input
                id="trn-name-input"
                type="text"
                maxLength={36}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t('trn.namePlaceholder')}
                className="tactile-input w-full rounded-[10px] px-3 py-2 text-sm font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-main)',
                }}
              />
            </div>

            {/* Bracket size selector (4 / 8 / 16) */}
            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('trn.formatLabel')}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {SIZES.map((s) => {
                  const active = size === s;
                  const titleKey =
                    s === 4 ? 'trn.size4' : s === 8 ? 'trn.size8' : 'trn.size16';
                  const descKey =
                    s === 4
                      ? 'trn.size4Desc'
                      : s === 8
                        ? 'trn.size8Desc'
                        : 'trn.size16Desc';
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSize(s);
                        haptics.tap();
                      }}
                      aria-pressed={active}
                      className="tactile-btn rounded-[11px] p-2.5 text-start flex flex-col gap-0.5"
                      style={{
                        backgroundColor: active
                          ? 'var(--accent-active-bg)'
                          : 'var(--bg-surface)',
                        border: active
                          ? '1.5px solid var(--accent-active)'
                          : '1px solid var(--border-cell)',
                      }}
                    >
                      <span
                        className="text-xs sm:text-sm font-extrabold"
                        style={{
                          color: active
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        {t(titleKey)}
                      </span>
                      <span
                        className="text-[10px] sm:text-[11px] leading-tight"
                        style={{
                          color: active
                            ? 'var(--accent-active-text)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {t(descKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clock / TimeControl selector */}
            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{t('trn.clockLabel')}</span>
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {TIME_CONTROLS.map((tc) => {
                  const active = timeControl === tc;
                  return (
                    <button
                      key={tc}
                      type="button"
                      onClick={() => {
                        setTimeControl(tc);
                        haptics.tap();
                      }}
                      aria-pressed={active}
                      className="tactile-btn rounded-[9px] px-2.5 py-2 text-xs font-semibold text-center"
                      style={{
                        backgroundColor: active
                          ? 'var(--btn-primary-bg)'
                          : 'var(--bg-surface)',
                        color: active
                          ? 'var(--btn-primary-text)'
                          : 'var(--text-secondary)',
                        border: active
                          ? '1px solid var(--btn-primary-bg)'
                          : '1px solid var(--border-cell)',
                      }}
                    >
                      {translateTimeControl(tc)}
                    </button>
                  );
                })}
              </div>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('tc.moveLimitNote')}
              </span>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (!ensureTournamentPseudo()) return;
                void onCreate({
                  name: nameInput,
                  size,
                  timeControl,
                  pseudo,
                });
              }}
              className="tactile-btn cta-primary w-full rounded-[12px] px-4 py-3 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <Crown className="w-4 h-4" />
              <span>{loading ? t('common.loading') : t('trn.createBtn')}</span>
              <ArrowRight className="w-4 h-4 cta-arrow" />
            </button>
          </section>

          {/* Join Tournament Card */}
          <section
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div>
              <h2
                className="text-base font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('trn.joinTitle')}
              </h2>
              <p
                className="text-xs mt-1 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('trn.joinDesc')}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ensureTournamentPseudo()) return;
                if (cleanCode.length === 6) {
                  void onJoin({ code: cleanCode, pseudo });
                }
              }}
              className="flex flex-col gap-2.5"
            >
              <input
                type="text"
                maxLength={6}
                value={codeInput}
                onChange={(e) => setCodeInput(normalizeRoomCode(e.target.value))}
                placeholder={t('trn.codePlaceholder')}
                className="tactile-input w-full rounded-[11px] px-3.5 py-2.5 font-mono text-base font-extrabold tracking-[0.22em] text-center uppercase"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                }}
              />
              <button
                type="submit"
                disabled={loading || cleanCode.length !== 6}
                className="tactile-btn w-full rounded-[11px] px-4 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                style={{
                  backgroundColor: 'var(--accent-active)',
                  color: 'var(--bg-board)',
                }}
              >
                <Users className="w-4 h-4" />
                <span>{t('trn.joinBtn')}</span>
              </button>
            </form>

            {/* Quick phase preview pills */}
            <div
              className="rounded-[12px] p-3 flex flex-col gap-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span style={{ color: 'var(--text-primary)' }}>{t('trn.size4')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{t('trn.size4Desc')}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span style={{ color: 'var(--text-primary)' }}>{t('trn.size8')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{t('trn.size8Desc')}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span style={{ color: 'var(--text-primary)' }}>{t('trn.size16')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{t('trn.size16Desc')}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const isHost = snapshot.hostId === playerId;
  const isParticipant = snapshot.participants.some((p) => p.id === playerId);

  // ==================== STATE 2: LOBBY (WAITING FOR FRIENDS) ====================
  if (snapshot.phase === 'lobby') {
    const count = snapshot.participants.length;
    const isFull = count >= snapshot.size;
    const canStart = isHost && count >= 2;
    const emptySlots = Math.max(0, snapshot.size - count);

    return (
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-4 py-2 sm:py-4">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                className="text-xl sm:text-2xl font-extrabold tracking-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {snapshot.name}
              </h1>
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold"
                style={{
                  backgroundColor: 'var(--accent-active-bg)',
                  color: 'var(--accent-active-text)',
                  border: '1px solid var(--accent-active)',
                }}
              >
                #{snapshot.code}
              </span>
            </div>
            <div
              className="mt-1 flex items-center gap-3 text-xs font-medium flex-wrap"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {snapshot.size} {t('common.players')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {translateTimeControl(snapshot.timeControl)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="tactile-btn rounded-[10px] p-2"
              aria-label={t('common.refresh')}
              style={{
                backgroundColor: 'var(--bg-board)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isParticipant) void onLeaveOrKick();
                else onExitHub();
              }}
              className="tactile-btn rounded-[10px] px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-board)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              {isParticipant ? t('trn.leaveBtn') : t('trn.backToHub')}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-[11px] px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger-color)',
              border: '1px solid var(--danger-color)',
            }}
          >
            <span>{error}</span>
            <button type="button" onClick={onClearError} className="underline text-[11px]">
              {t('common.close')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          {/* Participants grid */}
          <section
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                className="text-sm sm:text-base font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('trn.participantsTitle', { count, size: snapshot.size })}
              </h2>
              <span
                className="text-xs font-mono font-bold tabular-nums"
                style={{ color: 'var(--accent-active-text)' }}
              >
                {Math.round((count / snapshot.size) * 100)}%
              </span>
            </div>

            {/* Progress bar */}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-recessed)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (count / snapshot.size) * 100)}%`,
                  backgroundColor: 'var(--accent-active)',
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {snapshot.participants.map((p, idx) => {
                const isSelf = p.id === playerId;
                const pIsHost = p.id === snapshot.hostId;
                return (
                  <div
                    key={p.id}
                    className="rounded-[11px] px-3 py-2.5 flex items-center justify-between gap-2"
                    style={{
                      backgroundColor: isSelf
                        ? 'var(--accent-active-bg)'
                        : 'var(--bg-surface)',
                      border: isSelf
                        ? '1px solid var(--accent-active)'
                        : '1px solid var(--border-cell)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-7 h-7 rounded-lg inline-flex items-center justify-center font-mono text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-board)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-main)',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs sm:text-sm font-bold truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {p.pseudo}
                          </span>
                          {pIsHost && (
                            <Crown
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: 'var(--accent-active-text)' }}
                            />
                          )}
                          {isSelf && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none"
                              style={{
                                backgroundColor: 'var(--bg-board)',
                                color: 'var(--accent-active-text)',
                              }}
                            >
                              {t('common.you')}
                            </span>
                          )}
                        </div>
                        <span
                          className="font-mono text-[11px] tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {p.elo} Elo
                        </span>
                      </div>
                    </div>

                    {isHost && !isSelf && (
                      <button
                        type="button"
                        onClick={() => void onLeaveOrKick(p.id)}
                        title={t('trn.kick')}
                        aria-label={`${t('trn.kick')} ${p.pseudo}`}
                        className="tactile-btn rounded-lg p-1.5 shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {Array.from({ length: emptySlots }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="rounded-[11px] px-3 py-2.5 flex items-center gap-2.5 opacity-55"
                  style={{
                    border: '1px dashed var(--border-strong)',
                    backgroundColor: 'transparent',
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-lg inline-flex items-center justify-center font-mono text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {count + idx + 1}
                  </span>
                  <span
                    className="text-xs italic"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    …
                  </span>
                </div>
              ))}
            </div>

            {/* Status & Launch button */}
            <div
              className="rounded-[12px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {count < 2
                  ? t('trn.waitingMore')
                  : isFull
                    ? t('trn.readyFull', { size: snapshot.size })
                    : t('trn.byesNote', { count, size: snapshot.size })}
              </p>

              {!isParticipant ? (
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 w-full sm:w-auto">
                  {!hasAccount && (
                    <div className="flex flex-col gap-1 min-w-[160px]">
                      <input
                        ref={pseudoInputRef}
                        type="text"
                        required
                        maxLength={20}
                        value={pseudo}
                        aria-label={t('play.pseudoGuest')}
                        aria-invalid={Boolean(pseudoError)}
                        onChange={(e) => {
                          onChangePseudo(e.target.value);
                          if (pseudoError && validateGuestPseudo(e.target.value).ok) {
                            setPseudoError(null);
                          }
                        }}
                        placeholder={`${t('play.pseudoGuest')} *`}
                        className="tactile-input rounded-[10px] px-3 py-2 text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--bg-board)',
                          color: 'var(--text-primary)',
                          border: `1px solid ${pseudoError ? 'var(--danger-color)' : 'var(--border-main)'}`,
                        }}
                      />
                      {pseudoError && (
                        <span className="text-[11px] font-medium" style={{ color: 'var(--danger-color)' }}>
                          {pseudoError}
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={loading || isFull}
                    onClick={() => {
                      if (!ensureTournamentPseudo()) return;
                      void onJoin({ code: snapshot.code, pseudo });
                    }}
                    className="tactile-btn shrink-0 rounded-[10px] px-4 py-2.5 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
                    style={{
                      backgroundColor: 'var(--accent-active)',
                      color: 'var(--bg-board)',
                    }}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{t('trn.joinBtn')}</span>
                  </button>
                </div>
              ) : isHost ? (
                <button
                  type="button"
                  disabled={!canStart || loading}
                  onClick={() => void onStart()}
                  className="tactile-btn cta-primary shrink-0 rounded-[10px] px-4 py-2.5 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{t('trn.startBtn')}</span>
                </button>
              ) : (
                <span
                  className="shrink-0 text-xs font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t('trn.waitingHostStart')}
                </span>
              )}
            </div>
          </section>

          {/* Invite Card (Code + Link + QR Code) */}
          <aside
            className="rounded-[16px] p-4 flex flex-col gap-3.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <h3
              className="text-sm font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('trn.inviteTitle')}
            </h3>

            <div
              className="rounded-[12px] py-3 px-4 text-center"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
              }}
            >
              <div
                className="font-mono text-2xl font-black tracking-[0.26em] select-all"
                style={{ color: 'var(--text-primary)' }}
              >
                {snapshot.code}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copyText(inviteUrl, 'link')}
                className="tactile-btn rounded-[10px] px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                {copiedType === 'link' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedType === 'link' ? t('trn.linkCopied') : t('trn.copyLink')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void copyText(snapshot.code, 'code')}
                className="tactile-btn rounded-[10px] px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                {copiedType === 'code' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedType === 'code' ? t('trn.codeCopied') : t('trn.copyCode')}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              className="tactile-btn w-full rounded-[9px] px-3 py-1.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <QrCodeIcon className="w-3.5 h-3.5" />
              <span>{showQr ? t('trn.hideQr') : t('trn.showQr')}</span>
            </button>

            {showQr && inviteUrl && (
              <div className="flex justify-center pt-1">
                <QrCode value={inviteUrl} size={148} label={snapshot.name} />
              </div>
            )}
          </aside>
        </div>
      </div>
    );
  }

  // ==================== STATE 3: RUNNING OR FINISHED BRACKET ====================
  const champion = findParticipantById(snapshot.participants, snapshot.championId);
  const runnerUp = findParticipantById(snapshot.participants, snapshot.runnerUpId);

  // Find current user's active match (ready or live)
  let myActiveMatch: TournamentMatch | null = null;
  if (snapshot.phase === 'running') {
    for (const r of snapshot.rounds) {
      for (const m of r.matches) {
        if (
          (m.status === 'ready' || m.status === 'live') &&
          (m.playerA?.id === playerId || m.playerB?.id === playerId)
        ) {
          myActiveMatch = m;
        }
      }
    }
  }

  const myOpponent = myActiveMatch
    ? myActiveMatch.playerA?.id === playerId
      ? myActiveMatch.playerB
      : myActiveMatch.playerA
    : null;

  const visibleRounds =
    selectedRound === 'all'
      ? snapshot.rounds
      : snapshot.rounds.filter((r) => r.roundIndex === selectedRound);

  return (
    <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-4 py-2 sm:py-4">
      {snapshot.phase === 'finished' && <Confetti />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1
              className="text-xl sm:text-2xl font-extrabold tracking-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {snapshot.name}
            </h1>
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              #{snapshot.code}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <Clock className="w-3 h-3" />
              {translateTimeControl(snapshot.timeControl)}
            </span>
          </div>
          {!isParticipant && snapshot.phase === 'running' && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('trn.spectatorBanner')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyText(inviteUrl, 'link')}
            className="tactile-btn rounded-[10px] px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            {copiedType === 'link' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedType === 'link' ? t('trn.linkCopied') : t('trn.copyLink')}</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            aria-label={t('common.refresh')}
            className="tactile-btn rounded-[10px] p-2"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onExitHub}
            className="tactile-btn rounded-[10px] px-3 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            {snapshot.phase === 'finished' ? t('trn.newTournament') : t('trn.backToHub')}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[11px] px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger-color)',
            border: '1px solid var(--danger-color)',
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={onClearError} className="underline text-[11px]">
            {t('common.close')}
          </button>
        </div>
      )}

      {/* Champion Podium Banner */}
      {snapshot.phase === 'finished' && champion && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32, ease: SMOOTH_EASE }}
          className="rounded-[16px] p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            backgroundColor: 'var(--bg-board)',
            border: '2px solid var(--accent-active)',
            boxShadow: 'var(--shadow-active)',
          }}
        >
          <div className="flex items-center gap-3.5">
            <span
              className="w-12 h-12 rounded-2xl inline-flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1.5px solid var(--accent-active)',
              }}
            >
              <Trophy className="w-6 h-6" />
            </span>
            <div>
              <div
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--accent-active-text)' }}
              >
                {t('trn.championTitle')}
              </div>
              <div
                className="text-xl sm:text-2xl font-black tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {champion.pseudo}
              </div>
              {runnerUp && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('trn.runnerUp', { name: runnerUp.pseudo })}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onExitHub}
            className="tactile-btn rounded-[11px] px-4 py-2.5 text-xs sm:text-sm font-bold inline-flex items-center gap-2"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <Crown className="w-4 h-4" />
            <span>{t('trn.newTournament')}</span>
          </button>
        </motion.div>
      )}

      {/* Personal Active Match CTA Banner */}
      {myActiveMatch && myOpponent && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: SMOOTH_EASE }}
          className="rounded-[14px] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--accent-active-bg)',
            border: '1.5px solid var(--accent-active)',
            boxShadow: 'var(--shadow-active)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="live-dot shrink-0" />
            <div className="min-w-0">
              <p
                className="text-xs sm:text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {myActiveMatch.status === 'live'
                  ? t('trn.yourMatchLive', {
                      round: translateRoundKey(myActiveMatch.roundKey),
                      opponent: myOpponent.pseudo,
                    })
                  : t('trn.yourMatchReady', {
                      round: translateRoundKey(myActiveMatch.roundKey),
                      opponent: myOpponent.pseudo,
                    })}
              </p>
              {myActiveMatch.needsTiebreak && (
                <p
                  className="text-[11px] font-semibold mt-0.5"
                  style={{ color: 'var(--danger-color)' }}
                >
                  {t('trn.tiebreakNote')}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={busyMatchId === myActiveMatch.id}
            onClick={() => void onPlayMatch(myActiveMatch!.id)}
            className="tactile-btn cta-primary shrink-0 rounded-[10px] px-4 py-2.5 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-55"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <Swords className="w-4 h-4" />
            <span>
              {myActiveMatch.status === 'live'
                ? t('trn.rejoinMyMatch')
                : t('trn.playMyMatch')}
            </span>
            <ArrowRight className="w-4 h-4 cta-arrow" />
          </button>
        </motion.div>
      )}

      {/* Round selector pills (useful on phones / 16-player trees) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setSelectedRound('all')}
          className="tactile-btn shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor:
              selectedRound === 'all' ? 'var(--btn-primary-bg)' : 'var(--bg-board)',
            color:
              selectedRound === 'all'
                ? 'var(--btn-primary-text)'
                : 'var(--text-secondary)',
            border: '1px solid var(--border-main)',
          }}
        >
          {t('trn.allRounds')}
        </button>
        {snapshot.rounds.map((r) => {
          const active = selectedRound === r.roundIndex;
          return (
            <button
              key={r.roundIndex}
              type="button"
              onClick={() => setSelectedRound(r.roundIndex)}
              className="tactile-btn shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: active ? 'var(--btn-primary-bg)' : 'var(--bg-board)',
                color: active ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              {translateRoundKey(r.roundKey)}
            </button>
          );
        })}
      </div>

      {/* Knockout Bracket Tree */}
      <div
        className="w-full overflow-x-auto rounded-[16px] p-4 sm:p-5"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className="flex gap-5 sm:gap-7 items-stretch"
          style={{
            minWidth:
              selectedRound === 'all'
                ? `${Math.max(540, visibleRounds.length * 244)}px`
                : '100%',
          }}
        >
          {visibleRounds.map((round) => (
            <div
              key={round.roundIndex}
              className="flex-1 min-w-[224px] flex flex-col gap-3"
            >
              {/* Round column title */}
              <div
                className="rounded-[9px] px-3 py-1.5 text-center text-xs font-extrabold tracking-tight"
                style={{
                  backgroundColor:
                    round.roundKey === 'final'
                      ? 'var(--accent-active-bg)'
                      : 'var(--bg-surface)',
                  color:
                    round.roundKey === 'final'
                      ? 'var(--accent-active-text)'
                      : 'var(--text-primary)',
                  border:
                    round.roundKey === 'final'
                      ? '1px solid var(--accent-active)'
                      : '1px solid var(--border-cell)',
                }}
              >
                {translateRoundKey(round.roundKey)}
              </div>

              {/* Vertically balanced matches column */}
              <div className="flex-1 flex flex-col justify-around gap-3">
                {round.matches.map((match) => {
                  const isMyMatch =
                    match.playerA?.id === playerId || match.playerB?.id === playerId;
                  const canPlay =
                    isMyMatch && (match.status === 'ready' || match.status === 'live');
                  const canWatch =
                    !isMyMatch && match.status === 'live' && Boolean(match.roomCode);
                  const canHostForfeit =
                    isHost &&
                    (match.status === 'ready' || match.status === 'live') &&
                    Boolean(match.playerA && match.playerB);

                  const isFinal = match.roundKey === 'final';
                  const statusLabel = t(`trn.status.${match.status}`);

                  const renderSlot = (
                    p: TournamentParticipant | null,
                    symbol: 'X' | 'O',
                  ) => {
                    const isWinner = Boolean(p && match.winnerId === p.id);
                    const isEliminated =
                      Boolean(p && match.winnerId && match.winnerId !== p.id);
                    const isSelf = Boolean(p && p.id === playerId);
                    const isByeEmpty = !p && match.status === 'bye';

                    return (
                      <div
                        className="px-2.5 py-2 flex items-center justify-between gap-2 rounded-[8px]"
                        style={{
                          backgroundColor: isWinner
                            ? 'var(--accent-active-bg)'
                            : isSelf
                              ? 'var(--bg-recessed)'
                              : 'transparent',
                          opacity: isEliminated ? 0.5 : 1,
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-5 h-5 rounded text-[10px] font-black inline-flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor:
                                symbol === 'X'
                                  ? 'var(--x-surface)'
                                  : 'var(--o-surface)',
                              color:
                                symbol === 'X' ? 'var(--x-color)' : 'var(--o-color)',
                            }}
                          >
                            {symbol}
                          </span>
                          <span
                            className={`text-xs truncate ${
                              isWinner
                                ? 'font-extrabold'
                                : p
                                  ? 'font-semibold'
                                  : 'italic'
                            } ${isEliminated ? 'line-through' : ''}`}
                            style={{
                              color: p ? 'var(--text-primary)' : 'var(--text-muted)',
                            }}
                          >
                            {p
                              ? p.pseudo
                              : isByeEmpty
                                ? t('trn.byeSlot')
                                : t('trn.tbd')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {p && (
                            <span
                              className="font-mono text-[10px] tabular-nums"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {p.elo}
                            </span>
                          )}
                          {isWinner && (
                            <Check
                              className="w-3.5 h-3.5"
                              style={{ color: 'var(--accent-active-text)' }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div
                      key={match.id}
                      className="rounded-[12px] p-2 flex flex-col gap-1"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border:
                          isMyMatch &&
                          (match.status === 'ready' || match.status === 'live')
                            ? '1.5px solid var(--accent-active)'
                            : isFinal
                              ? '1.5px solid var(--border-strong)'
                              : '1px solid var(--border-cell)',
                        boxShadow:
                          match.status === 'live'
                            ? 'var(--shadow-active)'
                            : undefined,
                      }}
                    >
                      {/* Match status strip */}
                      <div className="flex items-center justify-between gap-1 px-1 pb-0.5">
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide"
                          style={{
                            color:
                              match.status === 'live' || match.status === 'ready'
                                ? 'var(--accent-active-text)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {match.status === 'live' && <span className="live-dot" />}
                          <span>{statusLabel}</span>
                        </span>

                        {match.roomCode && match.status === 'live' && (
                          <span
                            className="font-mono text-[9px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            #{match.roomCode}
                          </span>
                        )}
                      </div>

                      {renderSlot(match.playerA, 'X')}
                      <div
                        className="h-px mx-1.5"
                        style={{ backgroundColor: 'var(--border-cell)' }}
                      />
                      {renderSlot(match.playerB, 'O')}

                      {match.needsTiebreak && (
                        <div
                          className="mx-1 mt-0.5 rounded px-2 py-1 text-[10px] font-semibold"
                          style={{
                            backgroundColor: 'var(--danger-bg)',
                            color: 'var(--danger-color)',
                          }}
                        >
                          {t('trn.tiebreakNote')}
                        </div>
                      )}

                      {/* Match actions */}
                      {(canPlay || canWatch || canHostForfeit) && (
                        <div className="pt-1 flex flex-col gap-1">
                          {canPlay && (
                            <button
                              type="button"
                              disabled={busyMatchId === match.id}
                              onClick={() => void onPlayMatch(match.id)}
                              className="tactile-btn w-full rounded-[8px] px-2.5 py-1.5 text-[11px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                              style={{
                                backgroundColor: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-text)',
                              }}
                            >
                              <Swords className="w-3 h-3" />
                              <span>
                                {match.status === 'live'
                                  ? t('trn.rejoinMyMatch')
                                  : t('trn.playMyMatch')}
                              </span>
                            </button>
                          )}

                          {canWatch && match.roomCode && (
                            <button
                              type="button"
                              onClick={() => onWatchRoom(match.roomCode!)}
                              className="tactile-btn w-full rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5"
                              style={{
                                backgroundColor: 'var(--bg-board)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-main)',
                              }}
                            >
                              <Eye className="w-3 h-3" />
                              <span>{t('trn.watchLive')}</span>
                            </button>
                          )}

                          {canHostForfeit && match.playerA && match.playerB && (
                            <div>
                              {forfeitOpenMatchId === match.id ? (
                                <div className="flex flex-col gap-1 pt-0.5">
                                  <div className="grid grid-cols-2 gap-1">
                                    <button
                                      type="button"
                                      disabled={busyMatchId === match.id}
                                      onClick={() => {
                                        setForfeitOpenMatchId(null);
                                        void onAdvanceForfeit(
                                          match.id,
                                          match.playerA!.id,
                                        );
                                      }}
                                      className="tactile-btn rounded px-1.5 py-1 text-[10px] font-bold truncate"
                                      style={{
                                        backgroundColor: 'var(--accent-active-bg)',
                                        color: 'var(--accent-active-text)',
                                        border: '1px solid var(--accent-active)',
                                      }}
                                    >
                                      ✓ {match.playerA.pseudo}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyMatchId === match.id}
                                      onClick={() => {
                                        setForfeitOpenMatchId(null);
                                        void onAdvanceForfeit(
                                          match.id,
                                          match.playerB!.id,
                                        );
                                      }}
                                      className="tactile-btn rounded px-1.5 py-1 text-[10px] font-bold truncate"
                                      style={{
                                        backgroundColor: 'var(--accent-active-bg)',
                                        color: 'var(--accent-active-text)',
                                        border: '1px solid var(--accent-active)',
                                      }}
                                    >
                                      ✓ {match.playerB.pseudo}
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setForfeitOpenMatchId(null)}
                                    className="text-[10px] underline"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {t('common.cancel')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setForfeitOpenMatchId(match.id)}
                                  className="w-full text-[10px] font-medium py-0.5 inline-flex items-center justify-center gap-1 opacity-70 hover:opacity-100"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>{t('trn.forfeitBtn')}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
