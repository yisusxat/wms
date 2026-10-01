const fs = require('fs');
let content = fs.readFileSync('apps/web/lib/api.ts', 'utf8');

// The fallback block for summary
const summaryBlockStart = content.indexOf("if (cleanPath === '/dashboard/summary') {");
const kpisBlockStart = content.indexOf("if (cleanPath === '/dashboard/kpis') {");
// Find the end of kpis block by looking for the next if block
const nextBlockStart = content.indexOf("if (cleanPath === '/inventory/discrepancies') {");

const summaryBlock = content.substring(summaryBlockStart, kpisBlockStart);
const kpisBlock = content.substring(kpisBlockStart, nextBlockStart);

const extractInner = (block) => {
  const innerStart = block.indexOf('{') + 1;
  const innerEnd = block.lastIndexOf('}');
  return block.substring(innerStart, innerEnd).trim();
};

const summaryInner = extractInner(summaryBlock);
const kpisInner = extractInner(kpisBlock);

const newFallbackFunctions = `
async function computeSummaryFallback<T>(insforgeUrl: string, headers: any): Promise<T> {
  ${summaryInner}
}

async function computeKpisFallback<T>(insforgeUrl: string, headers: any, category: string | null): Promise<T> {
  ${kpisInner}
}
`;

const newSummaryBlock = `if (cleanPath === '/dashboard/summary') {
    try {
      const res = await fetch(\`\${insforgeUrl}/api/database/records/v_dashboard_summary?limit=1\`, { headers });
      if (!res.ok) throw new Error('View not available');
      const rows = await res.json();
      const summaryRows = rows[0];
      if (!summaryRows) throw new Error('No data');

      return {
        products:      summaryRows.total_products,
        locations:     summaryRows.total_locations,
        occupiedLocations:  summaryRows.occupied_locations,
        availableLocations: summaryRows.available_locations,
        totalUnits:         summaryRows.total_units,
        entriesToday:       summaryRows.entries_today,
        issuesToday:        summaryRows.issues_today,
        transfersToday:     summaryRows.transfers_today,
        occupationPct:      summaryRows.occupation_percentage,
        lastRefreshed:      summaryRows.last_refreshed_at,
        recentMovements: [], // Fallback since vista materializada doesn't have it
        aisles: {
          aisleA: { code: 'A', name: 'Pasillo A (Norte)', total: 74, occupied: 0, rate: 0 },
          aisleB: { code: 'B', name: 'Pasillo B (Sur)', total: 74, occupied: 0, rate: 0 }
        }
      } as T;
    } catch (e) {
      return computeSummaryFallback<T>(insforgeUrl, headers);
    }
  }
`;

const newKpisBlock = `if (cleanPath === '/dashboard/kpis') {
    try {
      const res = await fetch(\`\${insforgeUrl}/api/database/records/v_dashboard_kpis?order=total_issued_30d.desc\`, { headers });
      if (!res.ok) throw new Error('View not available');
      const kpiRows = await res.json();
      if (!kpiRows || kpiRows.length === 0) throw new Error('No data');

      return {
        abcAnalysis: kpiRows.map((r: any) => ({
          productId:   r.product_id,
          sku:         r.sku,
          name:        r.product_name,
          category:    r.category,
          issued30d:   r.total_issued_30d,
          received30d: r.total_received_30d,
          stock:       r.current_stock,
          abcClass:    r.abc_class,
        })),
        lastRefreshed: kpiRows[0]?.last_refreshed_at,
        // Mock properties required by the frontend that were in the fallback
        occupancy: { rate: 0, occupied: 0, total: 0, alert: false, byZone: [] },
        abcClassification: { classA: {skuCount:0, percentage:0, items:[]}, classB: {skuCount:0, percentage:0, items:[]}, classC: {skuCount:0, percentage:0, items:[]} },
        deadStock: { count: 0, items: [] },
        dsi: { value: 0, totalStock: 0, avgDailyIssues: 0, alert: false },
        throughput: { trend: [], totalReceipts7d: 0, totalIssues7d: 0, balance: 0 },
        ira: { percentage: 0, totalAdjustments: 0, totalStock: 0, deviationRate: 0, alert: false },
        breakRisk: { count: 0, items: [] },
        cycleTimes: { dockToStockHours: 0, targetDockToStockHours: 0, orderCycleMinutes: 0, pickingUph: 0 },
        cubeUtilization: { totalCubicMeters: 0, usedCubicMeters: 0, cubeRate: 0 },
        skuAffinity: [],
        availableCategories: [],
        activeCategory: null,
      } as T;
    } catch (e) {
      return computeKpisFallback<T>(insforgeUrl, headers, null);
    }
  }
`;

content = content.substring(0, summaryBlockStart) + newSummaryBlock + '\n  ' + newKpisBlock + '\n  ' + content.substring(nextBlockStart);
content = content.replace('async function fallbackInsforge<T>', newFallbackFunctions + '\nasync function fallbackInsforge<T>');

fs.writeFileSync('apps/web/lib/api.ts', content);
console.log('Successfully updated api.ts');
