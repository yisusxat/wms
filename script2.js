const fs = require('fs');
let content = fs.readFileSync('apps/web/lib/api.ts', 'utf8');

const kpisBlockStart = content.indexOf("if (cleanPath === '/dashboard/kpis') {");
const nextBlockStart = content.indexOf("if (cleanPath === '/inventory/discrepancies') {");

const kpisBlock = content.substring(kpisBlockStart, nextBlockStart);

const extractInner = (block) => {
  const innerStart = block.indexOf('{') + 1;
  const innerEnd = block.lastIndexOf('}');
  return block.substring(innerStart, innerEnd);
};

const kpisInner = extractInner(kpisBlock);

const newKpisBlock = `if (cleanPath === '/dashboard/kpis') {
  const computeKpisFallback = async () => {${kpisInner}};
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
    return computeKpisFallback();
  }
}
`;

content = content.substring(0, kpisBlockStart) + newKpisBlock + '  ' + content.substring(nextBlockStart);
fs.writeFileSync('apps/web/lib/api.ts', content);
console.log('Successfully updated api.ts for KPIs');
