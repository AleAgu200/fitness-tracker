// Barcode and label scanning. Both produce a *draft* the athlete reviews;
// nothing is saved or logged here. Photos are resized, sent once and deleted
// from the phone's cache — PULSO keeps no copy.

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { SavedFoodItem } from '@/db/consumption';
import { ApiError, apiFetch } from './api';
import type { NutrientKey, Nutrients } from './nutrition-math';

export interface NutritionDraft {
  source: 'barcode' | 'label';
  sourceRef: string | null;
  productName: string | null;
  brand: string | null;
  basis: { amount: number; unit: 'g' | 'ml' };
  serving: { label: string | null; amount: number } | null;
  nutrients: Nutrients;
  uncertain: NutrientKey[];
  derived: string[];
  energyInconsistent: boolean;
  attribution: string | null;
}

export type ScanOutcome =
  | { status: 'draft'; draft: NutritionDraft }
  | { status: 'not_found' }
  | { status: 'offline' }
  | { status: 'unavailable' }
  | { status: 'plus_required' }
  | { status: 'unreadable'; reason: string }
  | { status: 'busy' }
  | { status: 'invalid' };

/** Whether this draft came from Open Food Facts (anything else with a code can be shared). */
export function fromOpenFoodFacts(draft: NutritionDraft): boolean {
  return draft.attribution?.includes('Open Food Facts') ?? false;
}

export interface SharedProduct {
  productName: string;
  brand: string | null;
  basis: { amount: number; unit: 'g' | 'ml' };
  serving: { label: string | null; amount: number } | null;
  nutrients: Nutrients;
}

/**
 * Adds a reviewed product to PULSO's shared catalog for a code Open Food
 * Facts didn't have, so the next scan finds it for everyone. Best effort:
 * offline or refused, the athlete's own save already happened.
 */
export async function shareBarcodeProduct(code: string, product: SharedProduct): Promise<void> {
  try {
    await apiFetch(`/api/nutrition/barcode/${encodeURIComponent(code)}`, { method: 'POST', body: product });
  } catch {
    // Nothing to tell the athlete: their product is saved on the phone either way.
  }
}

/**
 * A label read because its barcode wasn't in the catalog keeps that barcode,
 * so saving it makes the next scan of the same product find it.
 */
export function withBarcode(draft: NutritionDraft, code: string | null): NutritionDraft {
  return code ? { ...draft, source: 'barcode', sourceRef: code } : draft;
}

/** A product already saved from this barcode — works with no connection. */
export function draftFromSavedFood(food: SavedFoodItem): NutritionDraft {
  return {
    source: food.source === 'label' ? 'label' : 'barcode',
    sourceRef: food.sourceRef,
    productName: food.name,
    brand: food.brand,
    basis: food.basis,
    serving: food.servingAmount ? { label: food.servingLabel, amount: food.servingAmount } : null,
    nutrients: food.nutrients,
    uncertain: [],
    derived: [],
    energyInconsistent: false,
    attribution: null,
  };
}

function outcomeFromError(error: unknown): ScanOutcome {
  if (error instanceof ApiError) {
    if (error.status === 404) return { status: 'not_found' };
    if (error.status === 400) return { status: 'invalid' };
    if (error.status === 402) return { status: 'plus_required' };
    if (error.status === 422) return { status: 'unreadable', reason: error.code ?? 'unreadable' };
    if (error.status === 429) return { status: 'busy' };
    if (error.status === 503) return { status: 'unavailable' };
    return { status: 'unavailable' };
  }
  return { status: 'offline' };
}

export async function lookupBarcode(code: string): Promise<ScanOutcome> {
  try {
    const { draft } = await apiFetch<{ draft: NutritionDraft }>(`/api/nutrition/barcode/${encodeURIComponent(code)}`);
    return { status: 'draft', draft };
  } catch (error) {
    return outcomeFromError(error);
  }
}

/** Whether label reading can be offered, before asking for a photo. */
export async function labelReadingStatus(): Promise<{ available: boolean; entitled: boolean } | null> {
  try {
    return await apiFetch<{ available: boolean; entitled: boolean }>('/api/nutrition/label');
  } catch {
    return null;
  }
}

const MAX_WIDTH = 1600;

/**
 * Sends a cropped label photo for reading. The picture is scaled down and
 * re-encoded (which also drops its metadata), and every local copy is deleted
 * whatever the result.
 */
export async function readLabel(photoUri: string): Promise<ScanOutcome> {
  let resizedUri: string | null = null;
  try {
    const rendered = await ImageManipulator.manipulate(photoUri).resize({ width: MAX_WIDTH }).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    resizedUri = saved.uri;
    if (!saved.base64) return { status: 'unreadable', reason: 'label_image_rejected' };
    const { draft } = await apiFetch<{ draft: NutritionDraft }>('/api/nutrition/label', {
      method: 'POST',
      body: { image: saved.base64, mediaType: 'image/jpeg' },
    });
    return { status: 'draft', draft };
  } catch (error) {
    return outcomeFromError(error);
  } finally {
    for (const uri of [photoUri, resizedUri]) {
      if (!uri) continue;
      try {
        new File(uri).delete();
      } catch {
        // Already gone, or a gallery original we don't own — nothing to clean.
      }
    }
  }
}
