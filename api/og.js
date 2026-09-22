import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Minimal hyperscript so this file needs no JSX build step — satori accepts
// plain React-shaped element objects.
const h = (type, props = {}, ...children) => ({
  type,
  props: { ...props, children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children },
});

const ORANGE = '#f7931a';
const GREEN = '#22c55e';
const RED = '#ef4444';

function usd(n) {
  if (!isFinite(n)) return '$0';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function mono(size, color, extra = {}) {
  return { fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase', ...extra };
}

export default function handler(req) {
  const q = new URL(req.url).searchParams;
  const invested = Number(q.get('amount')) || 1000;
  const value = Number(q.get('value')) || 0;
  const date = q.get('date') || '';
  const sold = q.get('sell') || '';
  const up = value >= invested;

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z') : null;
  const when = parsed && !isNaN(parsed.getTime())
    ? parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
  const mult = invested > 0 ? value / invested : 0;
  const multTxt = mult >= 1000 ? `${Math.round(mult / 1000)}K×`
    : mult >= 10 ? `${Math.round(mult)}×`
    : `${mult.toFixed(2).replace(/\.?0+$/, '')}×`;

  return new ImageResponse(
    h('div', {
      style: {
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#080808', color: '#e8e0d4',
        padding: '64px 72px', fontFamily: 'sans-serif',
      },
    },
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: mono(24, ORANGE) }, '₿ Bitcoin Growth Calculator'),
        h('div', { style: { ...mono(26, '#6b6257'), marginTop: '34px' } },
          `${usd(invested)} invested${when ? ` in ${when}` : ''}`),
        h('div', {
          style: {
            fontSize: value >= 1e6 ? '132px' : '148px', color: up ? GREEN : RED,
            lineHeight: 1.05, marginTop: '8px', fontWeight: 700,
          },
        }, usd(value)),
        h('div', { style: { ...mono(28, '#6b6257'), marginTop: '10px' } },
          `${multTxt} ${up ? 'return' : 'of your money'}${sold ? ' · sold' : ' · still holding'}`)
      ),
      h('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid rgba(247,147,26,0.28)', paddingTop: '26px',
        },
      },
        h('div', { style: mono(22, '#6b6257') }, 'bitcoingrowthcalculator.com'),
        h('div', { style: mono(22, ORANGE) }, 'Run your own numbers →')
      )
    ),
    { width: 1200, height: 630 }
  );
}
