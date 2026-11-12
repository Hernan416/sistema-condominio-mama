// Tooltip compartido por los gráficos SVG hechos a mano (TrendChart, ExpenseBreakdownChart,
// BalanceTrendChart…): cada barra/punto trae [data-label] y [data-values] con lo que se muestra.
export function initChartTooltips(rootSelector: string) {
  // Varios gráficos en la misma página llaman esto cada uno: idempotente, para no duplicar
  // los listeners cuando dos o más gráficos comparten el mismo rootSelector.
  for (const chart of document.querySelectorAll<HTMLElement>(rootSelector)) {
    if (chart.dataset.vizTooltipReady) continue;
    chart.dataset.vizTooltipReady = '1';
    const tip = chart.querySelector<HTMLElement>('.viz-tooltip');
    const wrap = tip?.parentElement;
    if (!tip || !wrap) continue;
    const show = (hit: Element) => {
      const values = JSON.parse(hit.getAttribute('data-values') ?? '[]') as [string, string, string][];
      tip.replaceChildren();
      const title = document.createElement('p');
      title.className = 'mb-1 font-bold';
      title.textContent = hit.getAttribute('data-label') ?? '';
      tip.append(title);
      for (const [label, value, color] of values) {
        const row = document.createElement('p');
        row.className = 'flex items-center justify-between gap-4';
        const key = document.createElement('span');
        key.className = 'inline-flex items-center gap-2 text-ink-muted';
        const line = document.createElement('span');
        line.className = 'inline-block h-0.5 w-3 rounded';
        line.style.background = color;
        key.append(line, document.createTextNode(label));
        const val = document.createElement('strong');
        val.className = 'tabular';
        val.textContent = value;
        row.append(key, val);
        tip.append(row);
      }
      const box = hit.getBoundingClientRect();
      const host = wrap.getBoundingClientRect();
      tip.hidden = false;
      tip.classList.remove('hidden');
      const left = Math.min(Math.max(0, box.left - host.left + box.width / 2 - tip.offsetWidth / 2), host.width - tip.offsetWidth);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, box.top - host.top - 8)}px`;
    };
    const hide = () => tip.classList.add('hidden');
    for (const hit of chart.querySelectorAll('.viz-hit')) {
      hit.addEventListener('pointerenter', () => show(hit));
      hit.addEventListener('focus', () => show(hit));
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
    }
  }
}
