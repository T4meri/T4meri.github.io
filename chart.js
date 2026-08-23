(function () {
  const NS = 'http://www.w3.org/2000/svg';

  const THEME = {
    series: ['#c23b3b', '#4a9eda', '#57b98a', '#d99a3e', '#9a7fd1', '#d1687f', '#4fb3b3', '#b0894a'],
    grid: '#22222a',
    axis: '#3a3a44',
    ink: '#ededf0',
    muted: '#8b8b96',
    faint: '#5f5f6a'
  };

  const W = 640;
  const H = 360;
  const CHAR = 6.2;

  function el(name, attrs = {}, text) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function format(value) {
    if (!Number.isFinite(value)) return '';
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${+(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${+(value / 1000).toFixed(1)}k`;
    return String(+value.toFixed(2));
  }

  function clip(text, maxChars) {
    return text.length > maxChars ? `${text.slice(0, Math.max(maxChars - 1, 1))}…` : text;
  }

  function niceTicks(min, max, count = 5) {
    if (min === max) {
      min = Math.min(0, min);
      max = max === 0 ? 1 : max * 1.2;
    }
    const raw = (max - min) / count;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;

    const ticks = [];
    for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 1000; v += step) {
      ticks.push(+v.toFixed(10));
    }
    return ticks;
  }

  function normalise(spec) {
    const labels = Array.isArray(spec.labels) ? spec.labels.map(String) : [];
    let series = Array.isArray(spec.series) ? spec.series : [];
    if (series.length === 0 && Array.isArray(spec.data)) series = [{ name: spec.name ?? '', data: spec.data }];

    series = series
      .filter((s) => s && Array.isArray(s.data))
      .map((s, i) => ({
        name: String(s.name ?? `Series ${i + 1}`),
        data: s.data.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0))
      }));

    return {
      type: String(spec.type ?? 'bar').toLowerCase(),
      title: spec.title ? String(spec.title) : '',
      xLabel: spec.x ? String(spec.x) : '',
      yLabel: spec.y ? String(spec.y) : '',
      labels,
      series
    };
  }

  function paddingFor(spec) {
    return {
      top: spec.title ? 42 : 18,
      right: 18,
      bottom: 30 + (spec.series.length > 1 ? 22 : 0) + (spec.xLabel ? 18 : 0),
      left: spec.yLabel ? 58 : 46
    };
  }

  function scaleFor(spec, pad) {
    const all = spec.series.flatMap((s) => s.data);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(...all, 0));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const bottom = H - pad.bottom;

    return {
      ticks,
      bottom,
      baseline: lo < 0 && hi > 0 ? 0 : lo,
      yOf: (value) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - pad.top)
    };
  }

  function bands(pad, count) {
    const band = (W - pad.left - pad.right) / Math.max(count, 1);
    return { band, centre: (i) => pad.left + band * i + band / 2 };
  }

  function drawTitle(svg, spec) {
    if (!spec.title) return;
    svg.appendChild(
      el('text', { x: W / 2, y: 24, fill: THEME.ink, 'font-size': 15, 'font-weight': 600, 'text-anchor': 'middle' }, spec.title)
    );
  }

  function drawAxes(svg, spec, pad, plot) {
    for (const tick of plot.ticks) {
      const y = plot.yOf(tick);
      svg.appendChild(el('line', { x1: pad.left, y1: y, x2: W - pad.right, y2: y, stroke: THEME.grid, 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: pad.left - 9, y: y + 4, fill: THEME.faint, 'font-size': 11, 'text-anchor': 'end' }, format(tick)));
    }

    const base = plot.yOf(plot.baseline);
    svg.appendChild(el('line', { x1: pad.left, y1: base, x2: W - pad.right, y2: base, stroke: THEME.axis, 'stroke-width': 1 }));

    if (spec.yLabel) {
      const mid = (pad.top + plot.bottom) / 2;
      svg.appendChild(
        el('text', {
          x: 15, y: mid, fill: THEME.muted, 'font-size': 11, 'text-anchor': 'middle',
          transform: `rotate(-90 15 ${mid})`
        }, spec.yLabel)
      );
    }
    if (spec.xLabel) {
      svg.appendChild(el('text', { x: W / 2, y: H - 8, fill: THEME.muted, 'font-size': 11, 'text-anchor': 'middle' }, spec.xLabel));
    }
  }

  function drawCategories(svg, labels, pad, plot) {
    const { band, centre } = bands(pad, labels.length);
    const maxChars = Math.max(2, Math.floor(band / CHAR));
    const rotate = labels.some((l) => l.length > maxChars) && band < 44;
    const step = band < 22 ? Math.ceil(22 / band) : 1;

    labels.forEach((label, i) => {
      if (i % step !== 0) return;
      const x = centre(i);
      const y = plot.bottom + 16;

      if (rotate) {
        svg.appendChild(
          el('text', {
            x, y, fill: THEME.faint, 'font-size': 10, 'text-anchor': 'end',
            transform: `rotate(-35 ${x} ${y})`
          }, clip(label, 12))
        );
      } else {
        svg.appendChild(el('text', { x, y, fill: THEME.faint, 'font-size': 11, 'text-anchor': 'middle' }, clip(label, maxChars)));
      }
    });
  }

  function drawLegend(svg, spec, pad) {
    if (spec.series.length < 2) return;
    const y = H - (spec.xLabel ? 28 : 12);
    const widths = spec.series.map((s) => 22 + s.name.length * CHAR);
    let x = Math.max(pad.left, (W - widths.reduce((a, b) => a + b, 0)) / 2);

    spec.series.forEach((s, i) => {
      svg.appendChild(el('rect', { x, y: y - 8, width: 9, height: 9, fill: THEME.series[i % THEME.series.length] }));
      svg.appendChild(el('text', { x: x + 14, y, fill: THEME.muted, 'font-size': 11 }, s.name));
      x += widths[i];
    });
  }

  function renderBars(svg, spec, pad, plot) {
    const count = spec.series.length;
    const { band, centre } = bands(pad, spec.labels.length || spec.series[0].data.length);
    const group = Math.min(band * 0.72, 54 * count);
    const barWidth = group / count;
    const zero = plot.yOf(plot.baseline);

    spec.series.forEach((s, si) => {
      s.data.forEach((value, i) => {
        const y = plot.yOf(value);
        svg.appendChild(
          el('rect', {
            x: centre(i) - group / 2 + si * barWidth + 1,
            y: Math.min(y, zero),
            width: Math.max(barWidth - 2, 1),
            height: Math.max(Math.abs(zero - y), 1),
            fill: THEME.series[si % THEME.series.length]
          })
        );
      });
    });

    if (count === 1 && spec.series[0].data.length <= 14 && band > 30) {
      spec.series[0].data.forEach((value, i) => {
        svg.appendChild(
          el('text', { x: centre(i), y: plot.yOf(value) - 6, fill: THEME.muted, 'font-size': 10, 'text-anchor': 'middle' }, format(value))
        );
      });
    }
  }

  function renderLine(svg, spec, pad, plot, { area = false, connect = true } = {}) {
    spec.series.forEach((s, si) => {
      const colour = THEME.series[si % THEME.series.length];
      const { centre } = bands(pad, spec.labels.length || s.data.length);
      const pts = s.data.map((value, i) => [centre(i), plot.yOf(value)]);
      if (pts.length === 0) return;

      if (area) {
        const base = plot.yOf(plot.baseline);
        const d = `M${pts[0][0]},${base} ${pts.map((p) => `L${p[0]},${p[1]}`).join(' ')} L${pts[pts.length - 1][0]},${base} Z`;
        svg.appendChild(el('path', { d, fill: colour, 'fill-opacity': 0.16 }));
      }

      if (connect) {
        svg.appendChild(
          el('polyline', {
            points: pts.map((p) => p.join(',')).join(' '),
            fill: 'none', stroke: colour, 'stroke-width': 2, 'stroke-linejoin': 'round'
          })
        );
      }

      if (pts.length <= 40) {
        for (const [x, y] of pts) svg.appendChild(el('circle', { cx: x, cy: y, r: 3, fill: colour }));
      }
    });
  }

  function renderPie(svg, spec) {
    const values = (spec.series[0]?.data ?? []).map((v) => Math.max(v, 0));
    const total = values.reduce((sum, v) => sum + v, 0);
    if (total <= 0) throw new Error('every slice is zero');

    const legendWidth = 200;
    const cx = (W - legendWidth) / 2 + 10;
    const cy = 42 + (H - 42 - 20) / 2;
    const outer = Math.min(cy - 50, 118);
    const inner = outer * 0.55;
    let angle = -Math.PI / 2;

    values.forEach((value, i) => {
      const slice = (value / total) * Math.PI * 2;
      const end = angle + slice;
      const large = slice > Math.PI ? 1 : 0;
      const at = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;

      svg.appendChild(
        el('path', {
          d: slice >= Math.PI * 2
            ? `M${cx - outer},${cy} a${outer},${outer} 0 1 0 ${outer * 2},0 a${outer},${outer} 0 1 0 ${-outer * 2},0`
            : `M${at(outer, angle)} A${outer},${outer} 0 ${large} 1 ${at(outer, end)} L${at(inner, end)} A${inner},${inner} 0 ${large} 0 ${at(inner, angle)} Z`,
          fill: THEME.series[i % THEME.series.length]
        })
      );
      angle = end;
    });

    let y = cy - (values.length * 18) / 2 + 6;
    values.forEach((value, i) => {
      const label = clip(spec.labels[i] ?? `Item ${i + 1}`, 14);
      const pct = ((value / total) * 100).toFixed((value / total) * 100 < 10 ? 1 : 0);
      svg.appendChild(el('rect', { x: W - legendWidth + 6, y: y - 8, width: 9, height: 9, fill: THEME.series[i % THEME.series.length] }));
      svg.appendChild(el('text', { x: W - legendWidth + 20, y, fill: THEME.muted, 'font-size': 11 }, `${label} — ${format(value)} (${pct}%)`));
      y += 18;
    });
  }

  function render(rawSpec) {
    const spec = normalise(rawSpec);
    if (spec.series.length === 0 || spec.series[0].data.length === 0) throw new Error('chart has no data');

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      role: 'img',
      'aria-label': spec.title || `${spec.type} chart`,
      'font-family': 'Manrope, system-ui, sans-serif'
    });

    drawTitle(svg, spec);

    if (spec.type === 'pie' || spec.type === 'donut') {
      renderPie(svg, spec);
      return svg;
    }

    const pad = paddingFor(spec);
    const plot = scaleFor(spec, pad);

    drawAxes(svg, spec, pad, plot);
    drawCategories(svg, spec.labels.length ? spec.labels : spec.series[0].data.map((_, i) => String(i + 1)), pad, plot);

    if (spec.type === 'line') renderLine(svg, spec, pad, plot);
    else if (spec.type === 'area') renderLine(svg, spec, pad, plot, { area: true });
    else if (spec.type === 'scatter') renderLine(svg, spec, pad, plot, { connect: false });
    else renderBars(svg, spec, pad, plot);

    drawLegend(svg, spec, pad);
    return svg;
  }

  function hydrate(root) {
    for (const mount of root.querySelectorAll('.chart-mount:not([data-done])')) {
      let spec;
      try {
        spec = JSON.parse(mount.getAttribute('data-chart') ?? '');
      } catch {
        mount.textContent = 'Building chart…';
        mount.className = 'chart-mount chart-pending';
        continue;
      }

      try {
        mount.replaceChildren(render(spec));
        mount.className = 'chart-mount chart-ready';
      } catch (error) {
        mount.textContent = `Could not draw that chart: ${error.message}`;
        mount.className = 'chart-mount chart-failed';
      }
      mount.setAttribute('data-done', '1');
    }
  }

  window.SparkChart = { render, hydrate };
})();
