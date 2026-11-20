import { createDefaultEloProfile, type EloProfile } from '@shared/elo';
import {
  DEFAULT_BOARD_PREFS,
  type BoardPreferences,
} from '../types/boardPrefs';
import { isValidThemeId, type ThemeId } from '../types/theme';

const PLAYER_ID_KEY = 'sm_player_id';
const PROFILE_ID_KEY = 'sm_profile_id';
const PSEUDO_KEY = 'sm_pseudo';
const THEME_KEY = 'sm_theme';
const BOARD_PREFS_KEY = 'sm_board_prefs';
const MUTED_KEY = 'sm_muted';
const HAPTICS_KEY = 'sm_haptics';
const LAST_ROOM_KEY = 'sm_last_room';
const LOCAL_ELOS_KEY = 'sm_local_elos';
const AUTH_TOKEN_KEY = 'sm_auth_token';
const ENTRY_MODE_KEY = 'sm_entry_mode_chosen';

function generateId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreatePlayerId(): string {
  try {
    const existing = sessionStorage.getItem(PLAYER_ID_KEY);
    if (existing && existing.length > 4) {
      return existing;
    }
    const generated = generateId();
    sessionStorage.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return generateId();
  }
}

export function getOrCreateProfileId(): string {
  try {
    const existing = localStorage.getItem(PROFILE_ID_KEY);
    if (existing && existing.length > 4) {
      return existing;
    }
    const generated = generateId();
    localStorage.setItem(PROFILE_ID_KEY, generated);
    return generated;
  } catch {
    return generateId();
  }
}

export function getSavedPseudo(): string {
  try {
    return localStorage.getItem(PSEUDO_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePseudo(pseudo: string): void {
  try {
    localStorage.setItem(PSEUDO_KEY, pseudo.trim().slice(0, 20));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function getSavedTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isValidThemeId(value) ? value : 'atelier';
  } catch {
    return 'atelier';
  }
}

export function saveTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage errors
  }
}

export function getSavedBoardPrefs(): BoardPreferences {
  try {
    const raw = localStorage.getItem(BOARD_PREFS_KEY);
    if (!raw) return { ...DEFAULT_BOARD_PREFS };
    const parsed = JSON.parse(raw) as Partial<BoardPreferences>;
    return {
      pieceStyle:
        parsed.pieceStyle === 'classique' ||
        parsed.pieceStyle === 'calligraphie' ||
        parsed.pieceStyle === 'geometrique' ||
        parsed.pieceStyle === 'pions'
          ? parsed.pieceStyle
          : DEFAULT_BOARD_PREFS.pieceStyle,
      boardMaterial:
        parsed.boardMaterial === 'mat' ||
        parsed.boardMaterial === 'damier' ||
        parsed.boardMaterial === 'gravure'
          ? parsed.boardMaterial
          : DEFAULT_BOARD_PREFS.boardMaterial,
      boardShape:
        parsed.boardShape === 'doux' || parsed.boardShape === 'strict'
          ? parsed.boardShape
          : DEFAULT_BOARD_PREFS.boardShape,
      showCoords:
        typeof parsed.showCoords === 'boolean'
          ? parsed.showCoords
          : DEFAULT_BOARD_PREFS.showCoords,
      showProjector:
        typeof parsed.showProjector === 'boolean'
          ? parsed.showProjector
          : DEFAULT_BOARD_PREFS.showProjector,
    };
  } catch {
    return { ...DEFAULT_BOARD_PREFS };
  }
}

export function saveBoardPrefs(prefs: BoardPreferences): void {
  try {
    localStorage.setItem(BOARD_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

export function getSavedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

export function getSavedHaptics(): boolean {
  try {
    const raw = localStorage.getItem(HAPTICS_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function saveHaptics(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

export function getLastJoinedRoom(): string | null {
  try {
    return sessionStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

export function saveLastJoinedRoom(code: string | null): void {
  try {
    if (code) {
      sessionStorage.setItem(LAST_ROOM_KEY, code);
    } else {
      sessionStorage.removeItem(LAST_ROOM_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function normalizeLocalPseudoKey(pseudo: string): string {
  return pseudo.trim().toLowerCase().replace(/\s+/g, ' ') || 'joueur';
}

export function getSavedLocalElo(pseudo: string): EloProfile {
  try {
    const raw = localStorage.getItem(LOCAL_ELOS_KEY);
    if (!raw) return createDefaultEloProfile();
    const map = JSON.parse(raw) as Record<string, EloProfile>;
    const key = normalizeLocalPseudoKey(pseudo);
    const found = map[key];
    if (found && typeof found.rating === 'number') {
      return {
        rating: found.rating,
        gamesPlayed: Number(found.gamesPlayed) || 0,
        wins: Number(found.wins) || 0,
        draws: Number(found.draws) || 0,
        losses: Number(found.losses) || 0,
        peakRating: Number(found.peakRating) || found.rating,
        streak: Number(found.streak) || 0,
      };
    }
    return createDefaultEloProfile();
  } catch {
    return createDefaultEloProfile();
  }
}

export function saveLocalElo(pseudo: string, profile: EloProfile): void {
  try {
    const raw = localStorage.getItem(LOCAL_ELOS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, EloProfile>) : {};
    map[normalizeLocalPseudoKey(pseudo)] = profile;
    localStorage.setItem(LOCAL_ELOS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getSavedAuthToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token && token.length > 10 ? token : null;
  } catch {
    return null;
  }
}

export function saveAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function hasChosenEntryMode(): boolean {
  try {
    return (
      localStorage.getItem(ENTRY_MODE_KEY) === '1' ||
      Boolean(getSavedAuthToken())
    );
  } catch {
    return false;
  }
}

export function markEntryModeChosen(): void {
  try {
    localStorage.setItem(ENTRY_MODE_KEY, '1');
  } catch {
    // Ignore storage errors
  }
}
