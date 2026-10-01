/** Dataflow: product analytics, read left to right from source to consumer. */
export default {
  schema_version: 1,
  diagram_type: 'dataflow',
  meta: {
    title: 'Product analytics pipeline',
    subtitle: 'Where a number on a dashboard actually comes from',
    output: 'dataflow.html',
  },
  layers: [
    { id: 'src', name: 'SOURCES', note: 'systems of record' },
    { id: 'ing', name: 'INGEST', note: 'land it, do not change it' },
    { id: 'tf', name: 'TRANSFORM', note: 'modelled and tested' },
    { id: 'serve', name: 'SERVE', note: 'what gets queried' },
    { id: 'use', name: 'CONSUMERS', note: 'people and jobs' },
  ],
  nodes: [
    { id: 'appdb', layer: 'src', kind: 'source', label: 'app database', sublabel: 'orders and accounts' },
    { id: 'events', layer: 'src', kind: 'source', label: 'event stream', sublabel: 'clicks and views' },
    { id: 'crm', layer: 'src', kind: 'source', label: 'CRM', sublabel: 'vendor API' },

    { id: 'landing', layer: 'ing', kind: 'ingest', label: 'landing zone', sublabel: 'raw parquet, immutable' },

    { id: 'staging', layer: 'tf', kind: 'transform', label: 'staging', sublabel: 'typed and deduplicated' },
    { id: 'marts', layer: 'tf', kind: 'transform', label: 'marts', sublabel: 'business definitions' },

    { id: 'warehouse', layer: 'serve', kind: 'store', label: 'warehouse', sublabel: 'columnar, partitioned' },
    { id: 'metrics', layer: 'serve', kind: 'serve', label: 'metrics API', sublabel: 'one definition each' },

    { id: 'dash', layer: 'use', kind: 'consumer', label: 'dashboards', sublabel: 'refreshed each morning' },
    { id: 'model', layer: 'use', kind: 'consumer', label: 'churn model', sublabel: 'trained nightly' },
  ],
  links: [
    { id: 'd1', from: 'appdb', to: 'landing', variant: 'cdc', label: 'change capture' },
    { id: 'd2', from: 'events', to: 'landing', variant: 'stream', label: 'append' },
    { id: 'd3', from: 'crm', to: 'landing', variant: 'batch', label: 'hourly pull' },
    { id: 'd4', from: 'landing', to: 'staging', variant: 'batch', label: 'load' },
    { id: 'd5', from: 'staging', to: 'marts', variant: 'derived' },
    { id: 'd6', from: 'marts', to: 'warehouse', variant: 'batch' },
    { id: 'd7', from: 'marts', to: 'metrics', variant: 'batch' },
    { id: 'd8', from: 'warehouse', to: 'dash', variant: 'batch' },
    { id: 'd9', from: 'metrics', to: 'model', variant: 'stream' },
  ],
  steps: [
    {
      title: 'Three sources, one landing zone',
      lede: 'The three sources have nothing in common: a database, a stream and somebody else’s API. They land in the same place, in the shape they arrived in, because the cheapest thing to debug is raw data you can re-read.',
      nodes: ['appdb', 'events', 'crm', 'landing'],
      links: ['d1', 'd2', 'd3'],
      notes: [
        { k: 'change capture', v: 'Reads the write-ahead log instead of querying the database, so production never feels it.' },
        { k: 'landing zone', v: 'Immutable and raw. Every downstream mistake is replayable from here.' },
      ],
    },
    {
      title: 'Raw becomes modelled',
      lede: 'Staging makes it typed and deduplicated and does nothing else. Business meaning only enters at the mart layer, which is the single place a definition like "active customer" is allowed to live.',
      nodes: ['landing', 'staging', 'marts'],
      links: ['d4', 'd5'],
      notes: [
        { k: 'staging', v: 'One model per source table. No joins, no business logic, no opinions.' },
        { k: 'marts', v: 'Where definitions live. Two teams disagreeing about a metric argue here, once.' },
      ],
    },
    {
      title: 'Two ways to be asked',
      lede: 'A dashboard scans a lot of rows and tolerates a slow answer; a model wants one feature fast and often. Serving both from one store means one of them is always badly served, so there are two.',
      nodes: ['marts', 'warehouse', 'metrics'],
      links: ['d6', 'd7'],
      notes: [
        { k: 'warehouse', v: 'Columnar and partitioned by date, which is how analytical scans stay affordable.' },
        { k: 'metrics API', v: 'One endpoint per definition, so a number cannot be computed two different ways.' },
      ],
    },
    {
      title: 'Who actually reads it',
      lede: 'The consumers are the point, and they set every constraint upstream. The dashboard’s morning refresh is why the batch runs overnight; the model’s nightly training is why the feature table exists at all.',
      nodes: ['warehouse', 'metrics', 'dash', 'model'],
      links: ['d8', 'd9'],
      notes: [
        { k: 'dashboards', v: 'Refreshed before the working day. Nobody looks at yesterday twice.' },
        { k: 'churn model', v: 'Reads the same definitions the dashboard does, which is how its numbers stay arguable.' },
      ],
    },
  ],
};
