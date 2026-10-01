/** Sequence: one request that misses the cache, read down the time axis. */
export default {
  schema_version: 1,
  diagram_type: 'sequence',
  meta: {
    title: 'A cache miss, end to end',
    subtitle: 'What a cold read actually costs',
    output: 'sequence.html',
  },
  layers: [
    { id: 'p-client', name: 'BROWSER' },
    { id: 'p-api', name: 'API' },
    { id: 'p-cache', name: 'CACHE' },
    { id: 'p-db', name: 'DATABASE' },
  ],
  nodes: [
    { id: 'client', layer: 'p-client', kind: 'actor', label: 'browser', sublabel: 'one shopper' },
    { id: 'api', layer: 'p-api', kind: 'service', label: 'product-api', sublabel: 'stateless' },
    { id: 'cache', layer: 'p-cache', kind: 'store', label: 'redis', sublabel: '60s TTL' },
    { id: 'db', layer: 'p-db', kind: 'store', label: 'postgres', sublabel: 'read replica' },
  ],
  links: [
    { id: 's1', from: 'client', to: 'api', variant: 'call', label: 'GET /products/42' },
    { id: 's2', from: 'api', to: 'cache', variant: 'call', label: 'GET product:42' },
    { id: 's3', from: 'cache', to: 'api', variant: 'return', label: 'nil' },
    { id: 's4', from: 'api', to: 'api', variant: 'self', label: 'build query' },
    { id: 's5', from: 'api', to: 'db', variant: 'call', label: 'SELECT ... WHERE id' },
    { id: 's6', from: 'db', to: 'api', variant: 'return', label: '1 row, 38ms' },
    { id: 's7', from: 'api', to: 'cache', variant: 'async', label: 'SETEX 60' },
    { id: 's8', from: 'api', to: 'client', variant: 'return', label: '200, 44ms' },
  ],
  steps: [
    {
      title: 'Ask the cache first',
      lede: 'Every read starts the same way, whether or not it will be answered cheaply. The cache lookup costs about a millisecond, which is why it is worth paying even when it misses.',
      nodes: ['client', 'api', 'cache'],
      links: ['s1', 's2'],
      notes: [
        { k: 'product-api', v: 'Holds no state of its own, so any instance can answer any request.' },
        { k: 'redis', v: 'A sixty-second TTL: long enough to absorb a spike, short enough to not show stale prices.' },
      ],
    },
    {
      title: 'The miss',
      lede: 'A nil reply is not an error, it is the normal cold path. Everything after this point is the real cost of the request, and it is the only part a cache hit avoids.',
      nodes: ['cache', 'api'],
      links: ['s3', 's4'],
      notes: [
        { k: 'nil', v: 'Redis answers in about a millisecond whether it has the key or not.' },
        { k: 'build query', v: 'The service does its own work here. No network, but it is still latency.' },
      ],
    },
    {
      title: 'Down to the database',
      lede: 'The replica answers in thirty-eight milliseconds, which is most of the request. This is the number that moves when the cache hit rate changes, and the reason the cache exists at all.',
      nodes: ['api', 'db'],
      links: ['s5', 's6'],
      notes: [
        { k: 'read replica', v: 'Reads never contend with writes, so a slow read cannot stall the write path.' },
        { k: '38ms', v: 'Thirty-eight of the forty-four milliseconds the shopper waits for.' },
      ],
    },
    {
      title: 'Fill, then answer',
      lede: 'The cache write does not block the reply: the shopper gets their answer while Redis is still being filled. The next reader for the next sixty seconds pays one millisecond instead of forty-four.',
      nodes: ['api', 'cache', 'client'],
      links: ['s7', 's8'],
      notes: [
        { k: 'SETEX 60', v: 'Fire and forget. A failed cache write costs the next reader time, not this one correctness.' },
        { k: '200, 44ms', v: 'The cold number. The warm one is closer to four.' },
      ],
    },
  ],
};
