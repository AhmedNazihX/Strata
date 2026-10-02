/** Architecture: a checkout platform, read top-to-bottom by tier and left-to-right by order. */
export default {
  schema_version: 1,
  diagram_type: 'architecture',
  meta: {
    title: 'Checkout platform',
    subtitle: 'One order, from the storefront to the carrier',
    output: 'architecture.html',
    stepSeconds: 8,
  },
  layers: [
    { id: 'web', name: 'BROWSER', note: 'the only surface a shopper opens' },
    { id: 'edge', name: 'EDGE', note: 'cache, filter, route' },
    { id: 'svc', name: 'SERVICES', note: 'the application itself' },
    { id: 'data', name: 'DATA', note: 'state, cache and the event log' },
    { id: 'out', name: 'OUTSIDE', note: 'third parties we do not run' },
  ],
  nodes: [
    { id: 'browse', layer: 'web', col: 0, kind: 'ui', label: 'Storefront', sublabel: 'product pages' },
    { id: 'pay', layer: 'web', col: 3, kind: 'ui', label: 'Checkout', sublabel: 'cart and payment' },
    { id: 'status', layer: 'web', col: 6, kind: 'ui', label: 'Order status', sublabel: 'tracking page' },

    { id: 'cdn', layer: 'edge', col: 0, kind: 'edge', label: 'CDN', sublabel: 'static and cached pages' },
    { id: 'gw', layer: 'edge', col: 3, kind: 'edge', label: 'API gateway', sublabel: 'auth, rate limits' },

    { id: 'catalog', layer: 'svc', col: 0, kind: 'service', label: 'catalog-api', sublabel: 'search and detail' },
    { id: 'checkout', layer: 'svc', col: 3, kind: 'service', label: 'checkout-api', sublabel: 'cart, tax, order' },
    { id: 'payments', layer: 'svc', col: 5, kind: 'service', label: 'payments', sublabel: 'authorise and capture' },
    { id: 'fulfil', layer: 'svc', col: 7, kind: 'service', label: 'fulfilment', sublabel: 'pick, pack, ship' },

    { id: 'catdb', layer: 'data', col: 0, kind: 'store', label: 'catalog db', sublabel: 'read replicas' },
    { id: 'cache', layer: 'data', col: 2, kind: 'store', label: 'redis', sublabel: 'cart sessions' },
    { id: 'orders', layer: 'data', col: 4, kind: 'store', label: 'orders db', sublabel: 'the system of record' },
    { id: 'bus', layer: 'data', col: 6, kind: 'queue', label: 'events', sublabel: 'order_placed topic' },

    { id: 'cdnorigin', layer: 'out', col: 0, kind: 'external', label: 'object store', sublabel: 'images and bundles' },
    { id: 'psp', layer: 'out', col: 5, kind: 'external', label: 'payment provider', sublabel: 'cards and wallets' },
    { id: 'carrier', layer: 'out', col: 7, kind: 'external', label: 'carrier API', sublabel: 'labels and tracking' },
  ],
  links: [
    { id: 'l-browse', from: 'browse', to: 'cdn', label: 'HTTPS', variant: 'emphasis' },
    { id: 'l-assets', from: 'cdn', to: 'cdnorigin', variant: 'dashed' },
    { id: 'l-catalog', from: 'cdn', to: 'catalog', label: 'miss' },
    { id: 'l-catdb', from: 'catalog', to: 'catdb', label: 'SQL' },
    { id: 'l-pay', from: 'pay', to: 'gw', label: 'POST /orders', variant: 'emphasis' },
    { id: 'l-gw', from: 'gw', to: 'checkout' },
    { id: 'l-cart', from: 'checkout', to: 'cache', label: 'cart' },
    { id: 'l-order', from: 'checkout', to: 'orders', label: 'write order' },
    { id: 'l-charge', from: 'checkout', to: 'payments', label: 'charge' },
    { id: 'l-psp', from: 'payments', to: 'psp', label: 'authorise', variant: 'security' },
    { id: 'l-emit', from: 'checkout', to: 'bus', label: 'publish', variant: 'async' },
    { id: 'l-consume', from: 'bus', to: 'fulfil', label: 'consume', variant: 'async' },
    { id: 'l-ship', from: 'fulfil', to: 'carrier', label: 'book pickup' },
    { id: 'l-status', from: 'status', to: 'gw', label: 'poll' },
  ],
  steps: [
    {
      title: 'The whole picture',
      lede: 'Five tiers, and one rule that holds across all of them: the browser never reaches a database or a third party directly. Everything crosses the edge first, and only a service may hold a credential.',
      nodes: ['*'],
      links: [],
      notes: [
        { k: 'CDN', v: 'Serves anything that does not change per shopper, so the services only see real work.' },
        { k: 'API gateway', v: 'One place that authenticates, rate-limits and routes. Services trust what reaches them.' },
      ],
    },
    {
      title: 'Browsing is mostly cache',
      lede: 'A product page is static until it is not. The CDN answers from its own copy, falls through to the catalog service on a miss, and never touches the order path at all.',
      nodes: ['browse', 'cdn', 'cdnorigin', 'catalog', 'catdb'],
      links: ['l-browse', 'l-assets', 'l-catalog', 'l-catdb'],
      notes: [
        { k: 'object store', v: 'Images and JavaScript bundles, versioned by content hash so they cache forever.' },
        { k: 'read replicas', v: 'Catalog reads never contend with order writes, because they are not the same database.' },
      ],
    },
    {
      title: 'Checkout crosses the edge',
      lede: 'Paying is the first request that must be authenticated, so it goes through the gateway rather than the CDN. The cart lives in Redis until there is an order worth writing down.',
      nodes: ['pay', 'gw', 'checkout', 'cache', 'orders'],
      links: ['l-pay', 'l-gw', 'l-cart', 'l-order'],
      notes: [
        { k: 'redis', v: 'A cart is cheap to rebuild and expensive to lock, so it is cached rather than stored.' },
        { k: 'orders db', v: 'The system of record. Once a row lands here the order exists, whatever else fails.' },
      ],
    },
    {
      title: 'Money leaves the building',
      lede: 'The payment provider is the only outside party in the write path, and only one service may talk to it. Card details never reach our own storage at any point.',
      nodes: ['checkout', 'payments', 'psp', 'orders'],
      links: ['l-charge', 'l-psp'],
      notes: [
        { k: 'payments', v: 'The one service holding provider credentials, so the blast radius of a leak is one deploy.' },
        { k: 'payment provider', v: 'Holds the card. We hold a token, which is worth nothing anywhere else.' },
      ],
    },
    {
      title: 'Shipping happens later',
      lede: 'Nothing about picking and packing needs to finish while the shopper waits. Checkout publishes one event and returns; fulfilment picks it up on its own schedule and books the carrier.',
      nodes: ['checkout', 'bus', 'fulfil', 'carrier', 'status', 'gw'],
      links: ['l-emit', 'l-consume', 'l-ship', 'l-status'],
      notes: [
        { k: 'events topic', v: 'The seam between paying and shipping. Either side can be redeployed without the other.' },
        { k: 'carrier API', v: 'Slow and occasionally down, which is exactly why it sits behind a queue.' },
      ],
    },
  ],
};
