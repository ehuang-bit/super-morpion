export type PieceStyle = 'classique' | 'calligraphie' | 'geometrique' | 'pions';
export type BoardMaterial = 'mat' | 'damier' | 'gravure';
export type BoardShape = 'doux' | 'strict';

export interface BoardPreferences {
  pieceStyle: PieceStyle;
  boardMaterial: BoardMaterial;
  boardShape: BoardShape;
  showCoords: boolean;
  showProjector: boolean;
}

export const DEFAULT_BOARD_PREFS: BoardPreferences = {
  pieceStyle: 'classique',
  boardMaterial: 'mat',
  boardShape: 'doux',
  showCoords: true,
  showProjector: true,
};

export const PIECE_STYLES: readonly {
  id: PieceStyle;
  label: string;
  description: string;
}[] = [
  { id: 'classique', label: 'Classique', description: 'Traits arrondis fluides' },
  { id: 'calligraphie', label: 'Plume', description: 'Courbes à la main' },
  { id: 'geometrique', label: 'Précision', description: 'Équerre et double anneau' },
  { id: 'pions', label: 'Pions', description: 'Jetons gravés tactiles' },
];

export const BOARD_MATERIALS: readonly {
  id: BoardMaterial;
  label: string;
  description: string;
}[] = [
  { id: 'mat', label: 'Papier mat', description: 'Surface unie calme' },
  { id: 'damier', label: 'Damier', description: 'Alternance des zones' },
  { id: 'gravure', label: 'Grain pierre', description: 'Texture minérale fine' },
];

export const BOARD_SHAPES: readonly {
  id: BoardShape;
  label: string;
  description: string;
}[] = [
  { id: 'doux', label: 'Arrondi doux', description: 'Bords organiques' },
  { id: 'strict', label: 'Architectural', description: 'Angles francs' },
];
