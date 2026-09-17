import { scanImageViaProxy, detectColumnsViaProxy, extractJson } from './ai/geminiClient';

export interface ExtractedProduct {
  name: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
}

export const scanProductsFromImage = async (base64Image: string): Promise<ExtractedProduct[]> => {
  try {
    const text = await scanImageViaProxy(
      base64Image,
      "Identify all distinct store products visible in this image. Handle handwriting carefully. If a word or line is strikethrough (crossed out), it means 'CANCEL' or 'IGNORE' that entry - do not include it in the results. If writing is messy, try to infer the most likely product name. Extract: Name, Category, Typical Selling Price (Tsh), Typical Cost Price (Tsh), and Current Quantity. Return ONLY a JSON array of objects with keys: name (string), category (string), price (number), costPrice (number), stock (number)."
    );
    const parsed = extractJson(text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Gemini AI Scan Error:", error);
    throw error;
  }
};

export interface IntelligentColumnMap {
  name: string;
  stock: string;
  costPrice: string;
  expiryDate?: string;
}

export const detectSpreadsheetColumns = async (sampleData: any[]): Promise<IntelligentColumnMap> => {
  try {
    const text = await detectColumnsViaProxy(sampleData);
    return extractJson(text || "{}");
  } catch (error) {
    console.error("Column Detection Error:", error);
    return { name: 'name', stock: 'stock', costPrice: 'costPrice' };
  }
};


export const scanReceiptForPurchases = async (base64Image: string): Promise<ExtractedProduct[]> => {
  return scanProductsFromImage(base64Image); // Reusing the same logic but can be tailored if needed
};
