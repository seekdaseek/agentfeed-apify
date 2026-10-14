// Maps AgentFeed's /api/hl-whales?coin= response to one dataset item.

export const EVENT_NAME = 'liquidation-map';
export const COIN_PATTERN = /^[A-Z0-9]{1,15}$/;
export const DEFAULT_COINS = ['BTC', 'ETH', 'SOL'];
export const SOURCE = 'AgentFeed (x402.ochinimus.app), Hyperliquid on-chain positions';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const side = (s) => (s && typeof s === 'object'
    ? {
        accounts: num(s.accounts),
        notional_usd: num(s.notional_usd),
        avg_entry_px: num(s.avg_entry_px),
        avg_liq_distance_pct: num(s.avg_liq_distance_pct),
        within_10pct_of_liq_usd: num(s.within_10pct_of_liq_usd),
        unrealized_pnl_usd: num(s.unrealized_pnl_usd),
    }
    : null);

/**
 * Returns the item, or null when the response holds nothing worth selling: no data object, or neither a liquidation
 * band nor a position (a coin none of the tracked accounts hold).
 */
export function mapCoin(coin, body, fetchedAt = new Date().toISOString()) {
    const d = body?.data;
    if (!d || typeof d !== 'object') return null;
    const bands = Array.isArray(d.liquidation_clusters) ? d.liquidation_clusters : [];
    const positions = Array.isArray(d.top_positions) ? d.top_positions : [];
    if (bands.length === 0 && positions.length === 0) return null;
    return {
        coin: typeof d.coin === 'string' ? d.coin : coin,
        mark_price: num(d.mark_px),
        as_of: d.as_of ?? null,
        fetched_at: fetchedAt,
        net_usd: num(d.net_usd),
        long: side(d.long),
        short: side(d.short),
        liquidation_bands: bands.map((b) => ({
            price_from: num(b.from_px),
            price_to: num(b.to_px),
            long_usd_at_risk: num(b.longs_liq_usd),
            short_usd_at_risk: num(b.shorts_liq_usd),
        })),
        largest_positions: positions.map((p) => ({
            address: p.address ?? null,
            side: p.side ?? null,
            size: num(p.size),
            notional_usd: num(p.notional_usd),
            entry_px: num(p.entry_px),
            liquidation_px: num(p.liquidation_px),
            liq_distance_pct: num(p.liq_distance_pct),
            unrealized_pnl_usd: num(p.unrealized_pnl_usd),
            leverage: num(p.leverage),
            margin_mode: p.margin_mode ?? null,
        })),
        accounts_scanned: num(d.accounts_scanned),
        accounts_with_positions: num(d.accounts_with_positions),
        source: SOURCE,
    };
}
