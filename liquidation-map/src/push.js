// Decides how an item is pushed. An item with liquidation bands is a heatmap and is charged (the `liquidation-map` event).
// An item without any band (its note says so) is still returned but never charged: pushing without an event name touches only
// Apify's synthetic default-dataset-item event, which the platform bills only when the Actor's pricing defines it (A's does not).
export async function pushItem(item, { pushCharged, pushFree }) {
    if (Array.isArray(item.liquidation_bands) && item.liquidation_bands.length > 0) return pushCharged(item);
    await pushFree(item);
    return undefined;
}
