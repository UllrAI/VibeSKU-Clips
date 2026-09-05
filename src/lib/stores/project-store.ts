import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CharacterVoiceProfile } from "@/lib/db/schema";

// ==================== Character ====================

export interface Character {
  id: string;
  name: string;
  description?: string;
  /** Appearance description (English, injected into AI prompts) */
  appearance?: string;
  /** List of reference image URLs */
  referenceImages: string[];
  /** Voice preference */
  voiceProfile?: CharacterVoiceProfile;
  /** Whether this is the default on-screen character */
  isDefault?: boolean;
}

// ==================== Character Library Store (persisted) ====================

interface CharacterState {
  characters: Character[];
  addCharacter: (character: Character) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  getDefault: () => Character | undefined;
  /** Set the specified character as default and clear the default flag on all others */
  setDefault: (id: string) => void;
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      characters: [],

      addCharacter: (character) =>
        set((state) => ({ characters: [...state.characters, character] })),

      updateCharacter: (id, updates) =>
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      removeCharacter: (id) =>
        set((state) => ({
          characters: state.characters.filter((c) => c.id !== id),
        })),

      getDefault: () => get().characters.find((c) => c.isDefault),

      setDefault: (id) =>
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id
              ? { ...c, isDefault: true }
              : { ...c, isDefault: false }
          ),
        })),
    }),
    { name: "daihuo-jianshou-characters" }
  )
);
