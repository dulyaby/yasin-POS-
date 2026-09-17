import { processVoiceTranscriptViaProxy, extractJson } from './ai/geminiClient';
import { UnitType } from '../types';

export interface PartnerAIResponse {
  action: 'ADD_ITEM' | 'REMOVE_ITEM' | 'CLEAR_CART' | 'PROCESS_PAYMENT' | 'SELL_SPECIFIC' | 'APPLY_DISCOUNT';
  data: {
    raw_input?: string;
    qty?: number;
    unit?: UnitType;
    value?: number;
    confidence_score?: number;
  }[];
}

export const processVoiceTranscript = async (transcript: string): Promise<PartnerAIResponse | null> => {
  try {
    const systemInstruction = `You are a "Senior Business Partner" and Mathematics Expert for Retail POS. You are NOT an AI assistant; you are a professional human partner working alongside the business owner. Your specialty is "Unit-Aware Inventory Management".

      Understand Swahili and English commands for a POS system.
      
      UNIT RULES:
      - Pieces (pcs): Integers (1, 2, 5). Default if no unit specified.
      - Weight (kg, g): Decimal support. "kilo moja na nusu" -> qty: 1.5, unit: "kg". "gramu mia tano" -> qty: 0.5, unit: "kg" OR qty: 500, unit: "g".
      - Volume (L, ml): Decimal support. "lita mbili" -> qty: 2, unit: "L". "mililita mia mbili" -> qty: 200, unit: "ml".

      ACTIONS:
      - ADD_ITEM: "add 1.5kg meat", "ongeza nyama kilo moja na nusu" -> {"raw_input": "name", "qty": 1.5, "unit": "kg"}
      - REMOVE_ITEM: "remove 2 units of soda", "futa soda mbili" -> {"raw_input": "name", "qty": 2}
      - CLEAR_CART: "clear", "futa yote" -> {}
      - PROCESS_PAYMENT: "cash", "check out", "malipo", "lipa" -> {}
      - SELL_SPECIFIC: "sell 0.5kg steak", "uza steak nusu kilo" (Add + Checkout) -> {"raw_input": "steak", "qty": 0.5, "unit": "kg"}
      - APPLY_DISCOUNT: "5% discount", "punguza tano" -> {"value": 5}
      
      Fuzzy behavior: Be intelligent with spelling. Use the most logical unit if implied (e.g., meat is usually kg, soda is usually pcs or L).
      
      Return ONLY this JSON structure:
      {
        "action": "ADD_ITEM" | "REMOVE_ITEM" | "CLEAR_CART" | "PROCESS_PAYMENT" | "SELL_SPECIFIC" | "APPLY_DISCOUNT",
        "data": [ { "raw_input": "...", "qty": number, "unit": "pcs"|"kg"|"g"|"L"|"ml", "value": number } ]
      }`;

    const text = await processVoiceTranscriptViaProxy(transcript, systemInstruction);
    const result = extractJson(text || "{}");
    return result;
  } catch (error) {
    console.error("Partner failed:", error);
    return null;
  }
};
