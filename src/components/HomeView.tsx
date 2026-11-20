import { useState, type FormEvent } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import type { EloProfile } from '@shared/elo';
import { BOARD_COORDS, type Player } from '@shared/gameEngine';
import { TIME_CONTROL_LABELS, type TimeControl } from '@shared/protocol';
import {
  ArrowRight,
  Award,
  Clock,
  Link2,
  MonitorSmartphone,
  Swords,
} from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useOnlineGame';
import type { BoardPreferences } from '../types/boardPrefs';
import { normalizeRoomCode } from '../utils/format';
import { PROJECTOR_SPRING } from '../utils/motion';
import { SymbolMark } from './Symbols';

interface HomeViewProps {
  pseudo: string;
  onChangePseudo: (value: string) => void;
  timeControl: TimeControl;
  onChangeTimeControl: (tc: TimeControl) => void;
  playerElo: {
    profile: EloProfile;
    tier: string;
  };
  boardPrefs: BoardPreferences;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  isBusy: boolean;
  error: string | null;
  onCreateRoom: () => void;
  onJoinCode: (code: string) => void;
  onJoinMatchmaking: () => void;
}

const CADENCES: readonly TimeControl[] = ['unlimited', 'rapid', 'blitz'];

const SPECIMEN_BOARDS: readonly {
  status: 'active' | Player;
  cells: (Player | null)[];
}[] = [
  { status: 'X', cells: ['X', 'O', 'X', null, 'X', null, 'O', null, 'X'] },
  { status: 'active', cells: ['O', null, 'X', null, 'O', null, null, null, null] },
  { status: 'active', cells: [null, 'X', null, 'O', null, null, null, null, 'O'] },
  { status: 'active', cells: [null, null, null, 'X', 'O', null, 'X', null, null] },
  { status: 'O', cells: ['O', 'O', 'O', 'X', null, 'X', null, null, null] },
  { status: 'active', cells: [null, null, 'X', null, null, null, 'O', null, null] },
  { status: 'active', cells: ['X', null, null, null, 'O', null, null, null, null] },
  { status: 'active', cells: [null, null, null, null, null, null, null, null, null] },
  { status: 'X', cells: ['X', null, 'O', 'X', 'O', null, 'X', null, null] },
];

export function HomeView({
  pseudo,
  onChangePseudo,
  timeControl,
  onChangeTimeControl,
  playerElo,
  boardPrefs,
  connected,
  connectionStatus,
  isBusy,
  error,
  onCreateRoom,
  onJoinCode,
  onJoinMatchmaking,
}: HomeViewProps) {
  const [joinCode, setJoinCode] = useState('');
  const [specimenHoverCell, setSpecimenHoverCell] = useState<number | null>(null);

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeRoomCode(joinCode);
    if (cleaned.length === 6) {
      onJoinCode(cleaned);
    }
  };

  const normalizedJoin = normalizeRoomCode(joinCode);
  const activeSpecimenBoard = 5; // C2
  const specimenTargetBoard = specimenHoverCell;

  return (
    <main className="w-full max-w-[920px] mx-auto px-3 sm:px-6 flex-1 flex flex-col justify-center py-2 sm:py-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5 lg:gap-8 items-center">
        {/* Left column: Identity & Play Console */}
        <section className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[10px] p-1.5 shrink-0"
              style={{
                backgroundColor: 'var(--bg-board)',
                border: '1px solid var(--border-main)',
                boxShadow: 'var(--shadow-card)',
              }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 32 32" className="w-full h-full">
                <path
                  d="M11 3v26M21 3v26M3 11h26M3 21h26"
                  stroke="var(--border-strong)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M5.5 5.5l3.5 3.5M9 5.5l-3.5 3.5"
                  stroke="var(--x-color)"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="2.4"
                  fill="none"
                  stroke="var(--o-color)"
                  strokeWidth="2.1"
                />
                <rect
                  x="22.5"
                  y="22.5"
                  width="6.5"
                  height="6.5"
                  rx="1.5"
                  fill="var(--accent-active-bg)"
                  stroke="var(--accent-active)"
                  strokeWidth="1.6"
                />
              </svg>
            </div>
            <div>
              <h1
                className="text-xl sm:text-2xl font-bold tracking-tight leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Super Morpion
              </h1>
              <p
                className="text-xs sm:text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Duel stratégique 1v1 en ligne · chaque coup dicte la zone suivante
              </p>
            </div>
          </div>

          <div
            className="rounded-[16px] p-4 sm:p-5 flex flex-col gap-3.5"
            style={{
              backgroundColor: 'var(--bg-board)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {/* Compact Chess-style Elo Profile Summary */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-[11px] px-3 py-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-cell)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Award
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--accent-active-text)' }}
                  strokeWidth={1.9}
                />
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span
                    className="font-mono text-base font-bold tabular-nums leading-none"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {playerElo.profile.rating}
                  </span>
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Elo · {playerElo.tier}
                  </span>
                </div>
              </div>

              <div
                className="flex items-center gap-2 shrink-0 font-mono text-[11px] tabular-nums"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>
                  {playerElo.profile.wins}V·{playerElo.profile.draws}N·
                  {playerElo.profile.losses}D
                </span>
                <span className="hidden sm:inline">
                  · Record {playerElo.profile.peakRating}
                </span>
              </div>
            </div>

            {/* Pseudo input */}
            <div>
              <label
                htmlFor="home-pseudo-input"
                className="block text-xs font-semibold mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Votre pseudo
              </label>
              <input
                id="home-pseudo-input"
                type="text"
                maxLength={20}
                value={pseudo}
                onChange={(e) => onChangePseudo(e.target.value)}
                placeholder="Ex. Camille"
                autoComplete="nickname"
                className="tactile-input w-full rounded-[10px] px-3.5 py-2.5 text-base font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-main)',
                }}
              />
            </div>

            {/* Cadence selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Pendule</span>
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-1.5 p-1 rounded-[10px]"
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  border: '1px solid var(--border-cell)',
                }}
                role="radiogroup"
                aria-label="Cadence de la pendule"
              >
                {CADENCES.map((cadence) => {
                  const selected = timeControl === cadence;
                  return (
                    <button
                      key={cadence}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onChangeTimeControl(cadence)}
                      className="tactile-btn rounded-[8px] px-2 py-2 text-xs font-semibold leading-tight text-center"
                      style={{
                        backgroundColor: selected ? 'var(--bg-board)' : 'transparent',
                        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        boxShadow: selected ? 'var(--shadow-card)' : 'none',
                      }}
                    >
                      {TIME_CONTROL_LABELS[cadence]}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-[10px] px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--danger-bg)',
                  color: 'var(--danger-color)',
                  border: '1px solid var(--danger-color)',
                }}
              >
                {error}
              </div>
            )}

            {/* Primary CTA: Duel privé */}
            <button
              type="button"
              onClick={onCreateRoom}
              disabled={!connected || isBusy}
              className="tactile-btn w-full rounded-[11px] px-4 py-3 text-sm font-semibold flex items-center justify-between gap-2 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Link2 className="w-4 h-4" strokeWidth={1.9} />
                <span>Créer un duel privé</span>
              </span>
              <span className="text-xs font-normal opacity-80 inline-flex items-center gap-1">
                <span>Lien & code</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </span>
            </button>

            {/* Join existing code */}
            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <label htmlFor="join-code-input" className="sr-only">
                Code du salon à 6 caractères
              </label>
              <input
                id="join-code-input"
                type="text"
                maxLength={7}
                value={joinCode}
                onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
                placeholder="Code à 6 car."
                className="tactile-input flex-1 min-w-0 rounded-[10px] px-3 py-2 font-mono text-base uppercase tracking-[0.14em]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-main)',
                }}
              />
              <button
                type="submit"
                disabled={!connected || isBusy || normalizedJoin.length !== 6}
                className="tactile-btn shrink-0 rounded-[10px] px-4 py-2 text-xs sm:text-sm font-semibold disabled:opacity-45"
                style={{
                  backgroundColor: 'var(--bg-recessed)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                Rejoindre
              </button>
            </form>

            {/* Matchmaking rapide */}
            <button
              type="button"
              onClick={onJoinMatchmaking}
              disabled={!connected || isBusy}
              className="tactile-btn w-full rounded-[11px] px-3.5 py-2.5 text-left flex items-center justify-between gap-2.5 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-main)',
              }}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-active-bg)',
                    color: 'var(--accent-active-text)',
                  }}
                >
                  <Swords className="w-4 h-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm font-semibold truncate">
                    Trouver un adversaire
                  </span>
                  <span
                    className="block text-[11px] truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Matchmaking rapide en ligne
                  </span>
                </span>
              </span>
              <ArrowRight
                className="w-4 h-4 shrink-0 opacity-65"
                strokeWidth={1.9}
              />
            </button>

            {!connected && (
              <p
                className="flex items-start gap-1.5 text-[11px] leading-snug"
                style={{ color: 'var(--text-muted)' }}
              >
                <MonitorSmartphone
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  strokeWidth={1.75}
                />
                <span>
                  {connectionStatus === 'offline'
                    ? 'Serveur momentanément indisponible — rechargez la page dans quelques instants.'
                    : 'Connexion au serveur en ligne…'}
                </span>
              </p>
            )}
          </div>
        </section>

        {/* Right column (desktop): Live interactive architectural board preview */}
        <aside className="hidden lg:flex flex-col items-center gap-2.5">
          <div
            className={`w-full max-w-[340px] aspect-square ${
              boardPrefs.boardShape === 'strict' ? 'rounded-[6px]' : 'rounded-[16px]'
            } ${
              boardPrefs.boardMaterial === 'gravure' ? 'board-material-gravure' : ''
            } p-2.5 relative transition-[border-radius] duration-200`}
            style={{
              backgroundColor: 'var(--bg-recessed)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-board)',
            }}
            onPointerLeave={() => setSpecimenHoverCell(null)}
          >
            <LayoutGroup id="home-specimen">
              <div className="grid grid-cols-3 grid-rows-3 w-full h-full gap-1.5">
                {SPECIMEN_BOARDS.map((sb, bIdx) => {
                  const isActive = bIdx === activeSpecimenBoard;
                  const isTarget =
                    boardPrefs.showProjector && specimenTargetBoard === bIdx;
                  const isLockedTarget = isTarget && sb.status !== 'active';
                  const subBg =
                    sb.status === 'X'
                      ? 'var(--x-surface)'
                      : sb.status === 'O'
                        ? 'var(--o-surface)'
                        : boardPrefs.boardMaterial === 'damier' && bIdx % 2 === 1
                          ? 'var(--bg-surface)'
                          : 'var(--bg-board)';

                  return (
                    <div
                      key={bIdx}
                      className={`subboard-shell relative ${
                        boardPrefs.boardShape === 'strict'
                          ? 'rounded-[4px]'
                          : 'rounded-[9px]'
                      } p-1`}
                      style={{
                        backgroundColor: subBg,
                        border: `1px solid ${
                          isActive
                            ? 'var(--accent-active)'
                            : sb.status === 'X'
                              ? 'var(--x-color)'
                              : sb.status === 'O'
                                ? 'var(--o-color)'
                                : 'var(--border-main)'
                        }`,
                        boxShadow: isActive ? 'var(--shadow-active)' : 'none',
                      }}
                    >
                      {boardPrefs.showCoords && (
                        <span
                          className="pointer-events-none absolute top-0.5 left-1 z-10 font-mono text-[8px] leading-none opacity-45"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {BOARD_COORDS[bIdx]}
                        </span>
                      )}

                      {isTarget && (
                        <motion.div
                          layoutId="specimen-projector"
                          transition={PROJECTOR_SPRING}
                          className={`pointer-events-none absolute -inset-[1.5px] z-20 ${
                            boardPrefs.boardShape === 'strict'
                              ? 'rounded-[4px]'
                              : 'rounded-[9px]'
                          }`}
                          style={{
                            border: `2px dashed ${
                              isLockedTarget
                                ? 'var(--danger-color)'
                                : 'var(--accent-active)'
                            }`,
                            backgroundColor: isLockedTarget
                              ? 'var(--danger-bg)'
                              : 'var(--accent-active-bg)',
                          }}
                        />
                      )}

                      <div
                        className={`grid grid-cols-3 grid-rows-3 w-full h-full gap-[2px] ${
                          sb.status !== 'active' ? 'opacity-20' : ''
                        }`}
                      >
                        {sb.cells.map((val, cIdx) => {
                          const canPreview =
                            boardPrefs.showProjector && isActive && val === null;
                          const hovered = canPreview && specimenHoverCell === cIdx;
                          return (
                            <div
                              key={cIdx}
                              onPointerEnter={(e) => {
                                if (e.pointerType === 'mouse' && canPreview) {
                                  setSpecimenHoverCell(cIdx);
                                }
                              }}
                              className={`${
                                boardPrefs.boardShape === 'strict'
                                  ? 'rounded-[2px]'
                                  : 'rounded-[3px]'
                              } flex items-center justify-center p-[14%] ${
                                canPreview ? 'cursor-crosshair' : ''
                              }`}
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-cell)',
                              }}
                            >
                              {val !== null ? (
                                <SymbolMark
                                  player={val}
                                  size="cell"
                                  pieceStyle={boardPrefs.pieceStyle}
                                />
                              ) : hovered ? (
                                <SymbolMark
                                  player="X"
                                  size="cell"
                                  pieceStyle={boardPrefs.pieceStyle}
                                  ghost
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      {sb.status !== 'active' && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-[18%]">
                          <SymbolMark
                            player={sb.status}
                            size="captured"
                            pieceStyle={boardPrefs.pieceStyle}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>

          <p
            className="text-xs text-center font-medium min-h-[18px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {specimenTargetBoard === null
              ? 'Survolez une case de la zone C2 pour projeter le renvoi'
              : SPECIMEN_BOARDS[specimenTargetBoard].status !== 'active'
                ? `Zone ${BOARD_COORDS[specimenTargetBoard]} capturée → Coup libre adverse`
                : `Joue en ${BOARD_COORDS[specimenTargetBoard]} → renvoie l’adversaire en ${BOARD_COORDS[specimenTargetBoard]}`}
          </p>
        </aside>
      </div>
    </main>
  );
}
