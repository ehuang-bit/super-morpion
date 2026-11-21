export const SMOOTH_EASE = [0.22, 1, 0.36, 1] as const;

export const FOCUS_SPRING = {
  type: 'spring',
  stiffness: 360,
  damping: 32,
  mass: 0.85,
} as const;

export const PROJECTOR_SPRING = {
  type: 'spring',
  stiffness: 450,
  damping: 35,
  mass: 0.72,
} as const;

export const CAPTURE_SPRING = {
  type: 'spring',
  stiffness: 330,
  damping: 26,
  mass: 0.88,
} as const;

/** Tampon de capture : arrive de haut et s'écrase sur la zone. */
export const STAMP_SPRING = {
  type: 'spring',
  stiffness: 520,
  damping: 23,
  mass: 0.95,
} as const;

/** Pose d'une pièce : léger dépassement puis stabilisation. */
export const PLACE_SPRING = {
  type: 'spring',
  stiffness: 430,
  damping: 19,
  mass: 0.7,
} as const;

export const CHIP_SPRING = {
  type: 'spring',
  stiffness: 400,
  damping: 32,
  mass: 0.8,
} as const;

export const MODAL_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
} as const;
