import { Product } from '../types';

export interface AssociationMatrix {
  pairCounts: Map<string, Map<string, number>>;
  singleCounts: Map<string, number>;
  totalTransactions: number;
}

export interface SuggestedProduct {
  product: Product;
  score: number;
  confidencePercent?: number;
  coBoughtCount?: number;
  reason: string;
  badge: 'frequent' | 'popular' | 'category';
  sourceProductName?: string;
}

/**
 * Builds the market basket association matrix from historical sales.
 * Each sale has an `items` array of products purchased in that transaction.
 */
export function buildAssociationMatrix(sales: any[]): AssociationMatrix {
  const pairCounts = new Map<string, Map<string, number>>();
  const singleCounts = new Map<string, number>();
  let validTransactions = 0;

  for (const sale of sales) {
    const items = sale.items;
    if (!Array.isArray(items) || items.length === 0) continue;
    validTransactions++;

    // Extract unique product IDs in this transaction
    const uniqueProductIds = Array.from(
      new Set(items.map((i: any) => i.productId).filter(Boolean))
    ) as string[];

    // Count individual product appearances
    for (const pid of uniqueProductIds) {
      singleCounts.set(pid, (singleCounts.get(pid) || 0) + 1);
    }

    // Count co-occurring pairs (A and B bought together)
    for (let i = 0; i < uniqueProductIds.length; i++) {
      const idA = uniqueProductIds[i];
      if (!pairCounts.has(idA)) {
        pairCounts.set(idA, new Map());
      }
      const mapA = pairCounts.get(idA)!;

      for (let j = 0; j < uniqueProductIds.length; j++) {
        if (i === j) continue;
        const idB = uniqueProductIds[j];
        mapA.set(idB, (mapA.get(idB) || 0) + 1);
      }
    }
  }

  return {
    pairCounts,
    singleCounts,
    totalTransactions: validTransactions,
  };
}

/**
 * Given the current cart and inventory products, dynamically returns
 * the best related products based on historical purchasing patterns.
 */
export function getRelatedProducts(
  cartItems: { productId: string; name: string }[],
  allProducts: Product[],
  matrix: AssociationMatrix,
  options: {
    overstockEnabled?: boolean;
    maxResults?: number;
    lastAddedProductId?: string | null;
    language?: 'sw' | 'en';
  } = {}
): SuggestedProduct[] {
  if (!cartItems || cartItems.length === 0 || !allProducts || allProducts.length === 0) {
    return [];
  }

  const {
    overstockEnabled = false,
    maxResults = 5,
    lastAddedProductId = null,
    language = 'sw'
  } = options;

  const cartProductIds = new Set(cartItems.map(i => i.productId));
  const productMap = new Map<string, Product>();
  for (const p of allProducts) {
    productMap.set(p.id, p);
  }

  // Scores candidateProductId -> details
  const candidateScores = new Map<string, {
    score: number;
    coBoughtCount: number;
    confidence: number;
    sourceProductName: string;
    badge: 'frequent' | 'popular' | 'category';
  }>();

  // Find historical co-occurrences with items in the cart
  for (const cartItem of cartItems) {
    const isLatest = lastAddedProductId && cartItem.productId === lastAddedProductId;
    const weight = isLatest ? 1.5 : 1.0;
    const pairsForCartItem = matrix.pairCounts.get(cartItem.productId);
    const cartItemSalesCount = matrix.singleCounts.get(cartItem.productId) || 1;

    if (pairsForCartItem) {
      for (const [candidateId, count] of pairsForCartItem.entries()) {
        if (cartProductIds.has(candidateId)) continue;
        const candidateProduct = productMap.get(candidateId);
        if (!candidateProduct) continue;
        if (candidateProduct.stock <= 0 && !overstockEnabled) continue;

        const confidence = Math.round((count / cartItemSalesCount) * 100);
        const weightedScore = count * weight * (1 + confidence / 100);

        const existing = candidateScores.get(candidateId);
        if (existing) {
          existing.score += weightedScore;
          existing.coBoughtCount += count;
          if (confidence > existing.confidence) {
            existing.confidence = confidence;
            existing.sourceProductName = cartItem.name;
          }
        } else {
          candidateScores.set(candidateId, {
            score: weightedScore,
            coBoughtCount: count,
            confidence,
            sourceProductName: cartItem.name,
            badge: 'frequent'
          });
        }
      }
    }
  }

  // Convert candidate scores to sorted array
  const suggestions: SuggestedProduct[] = [];

  for (const [candidateId, data] of candidateScores.entries()) {
    const product = productMap.get(candidateId);
    if (!product) continue;

    let reason = '';
    if (language === 'en') {
      reason = data.confidence >= 20
        ? `${data.confidence}% of customers buy with ${data.sourceProductName}`
        : `Frequently bought together with ${data.sourceProductName} (${data.coBoughtCount}x)`;
    } else {
      reason = data.confidence >= 20
        ? `${data.confidence}% ya wateja hununua na ${data.sourceProductName}`
        : `Hunuliwa mara nyingi pamoja na ${data.sourceProductName} (mara ${data.coBoughtCount})`;
    }

    suggestions.push({
      product,
      score: data.score,
      confidencePercent: data.confidence,
      coBoughtCount: data.coBoughtCount,
      reason,
      badge: 'frequent',
      sourceProductName: data.sourceProductName
    });
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  // Fallback: If we don't have enough suggestions from historical patterns,
  // supplement with products in the same category or overall top-sellers
  if (suggestions.length < maxResults) {
    const suggestedIds = new Set(suggestions.map(s => s.product.id));
    const cartCategories = new Set(
      cartItems
        .map(i => productMap.get(i.productId)?.category)
        .filter(Boolean) as string[]
    );

    // 1. Same category items
    for (const cat of cartCategories) {
      if (suggestions.length >= maxResults) break;
      const categoryProducts = allProducts.filter(p => 
        p.category === cat &&
        !cartProductIds.has(p.id) &&
        !suggestedIds.has(p.id) &&
        (p.stock > 0 || overstockEnabled)
      );

      for (const p of categoryProducts) {
        if (suggestions.length >= maxResults) break;
        const salesCount = matrix.singleCounts.get(p.id) || 0;
        suggestions.push({
          product: p,
          score: 10 + salesCount,
          reason: language === 'en' 
            ? `Popular in ${cat}` 
            : `Maarufu katika kundi la ${cat}`,
          badge: 'category'
        });
        suggestedIds.add(p.id);
      }
    }

    // 2. Store top sellers (if still needed)
    if (suggestions.length < maxResults) {
      const topSellers = allProducts
        .filter(p => !cartProductIds.has(p.id) && !suggestedIds.has(p.id) && (p.stock > 0 || overstockEnabled))
        .map(p => ({ product: p, salesCount: matrix.singleCounts.get(p.id) || 0 }))
        .sort((a, b) => b.salesCount - a.salesCount);

      for (const item of topSellers) {
        if (suggestions.length >= maxResults) break;
        suggestions.push({
          product: item.product,
          score: item.salesCount,
          reason: language === 'en' ? 'Top-selling store item' : 'Bidhaa inayotoka sana dukani',
          badge: 'popular'
        });
        suggestedIds.add(item.product.id);
      }
    }
  }

  return suggestions.slice(0, maxResults);
}
