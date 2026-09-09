import { describe, it, expect } from 'vitest';
import {
  matchesFilter,
  executeFindInMemory,
  executeUpdateInMemory,
  executeDeleteInMemory,
  executeAggregateInMemory,
} from '../evaluator.js';

const sampleDocs = [
  { _id: '1', status: 'paid', total: 1500, customerId: 'c1', tier: 'gold', createdAt: new Date('2024-01-03') },
  { _id: '2', status: 'pending', total: 800, customerId: 'c2', tier: 'silver', createdAt: new Date('2024-01-01') },
  { _id: '3', status: 'paid', total: 200, customerId: 'c3', tier: 'bronze', createdAt: new Date('2024-01-02') },
  { _id: '4', status: 'cancelled', total: 3000, customerId: 'c1', tier: 'gold', createdAt: new Date('2024-01-04') },
  { _id: '5', status: 'pending', total: 500, customerId: 'c4', tier: 'silver', createdAt: new Date('2024-01-05') },
];

describe('matchesFilter', () => {
  it('matches equality filter', () => {
    const matches = sampleDocs.filter(d => matchesFilter(d as Record<string, unknown>, { status: 'paid' }));
    expect(matches).toHaveLength(2);
  });

  it('matches $gte comparison', () => {
    const matches = sampleDocs.filter(d => matchesFilter(d as Record<string, unknown>, { total: { $gte: 1000 } }));
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m._id)).toEqual(['1', '4']);
  });

  it('matches $gt (strictly greater)', () => {
    const matches = sampleDocs.filter(d => matchesFilter(d as Record<string, unknown>, { total: { $gt: 1000 } }));
    expect(matches).toHaveLength(2);
  });

  it('$gt does NOT match equal value (vs $gte)', () => {
    const matches = sampleDocs.filter(d => matchesFilter(d as Record<string, unknown>, { total: { $gt: 1500 } }));
    expect(matches).toHaveLength(1);
    expect(matches[0]._id).toBe('4');
  });

  it('matches $in operator', () => {
    const matches = sampleDocs.filter(d =>
      matchesFilter(d as Record<string, unknown>, { status: { $in: ['paid', 'pending'] } })
    );
    expect(matches).toHaveLength(4);
  });

  it('matches $or operator', () => {
    const matches = sampleDocs.filter(d =>
      matchesFilter(d as Record<string, unknown>, { $or: [{ status: 'paid' }, { tier: 'silver' }] })
    );
    expect(matches).toHaveLength(4);
  });

  it('throws on disallowed operator', () => {
    expect(() =>
      matchesFilter(sampleDocs[0] as Record<string, unknown>, { total: { $where: 'this.total > 0' } as unknown as Record<string, unknown> })
    ).toThrow();
  });
});

describe('executeFindInMemory', () => {
  it('finds with projection', () => {
    const result = executeFindInMemory(sampleDocs as Record<string, unknown>[], {
      type: 'FIND',
      collection: 'orders',
      filter: { status: 'paid' },
      projection: { _id: 0, total: 1, status: 1 },
    });
    expect(result).toHaveLength(2);
    expect(Object.keys(result[0])).toEqual(expect.arrayContaining(['status', 'total']));
    expect(result[0]).not.toHaveProperty('customerId');
  });

  it('sorts descending', () => {
    const result = executeFindInMemory(sampleDocs as Record<string, unknown>[], {
      type: 'FIND',
      collection: 'orders',
      filter: {},
      sort: { total: -1 },
    });
    expect(result[0]._id).toBe('4'); // total 3000
    expect(result[4]._id).toBe('3'); // total 200
  });

  it('limits results', () => {
    const result = executeFindInMemory(sampleDocs as Record<string, unknown>[], {
      type: 'FIND',
      collection: 'orders',
      filter: {},
      sort: { createdAt: -1 },
      limit: 3,
    });
    expect(result).toHaveLength(3);
  });
});

describe('executeUpdateInMemory - $inc', () => {
  it('increments numeric field with $inc', () => {
    const docs = [
      { _id: '1', tier: 'gold', points: 50 },
      { _id: '2', tier: 'silver', points: 30 },
      { _id: '3', tier: 'gold', points: 100 },
    ] as Record<string, unknown>[];

    const result = executeUpdateInMemory(docs, {
      type: 'UPDATE',
      collection: 'customers',
      filter: { tier: 'gold' },
      update: { $inc: { points: 100 } },
      multi: true,
    });

    expect(result.find(d => d._id === '1')?.['points']).toBe(150);
    expect(result.find(d => d._id === '3')?.['points']).toBe(200);
    expect(result.find(d => d._id === '2')?.['points']).toBe(30); // unchanged
  });

  it('$set replaces field (different from $inc)', () => {
    const docs = [{ _id: '1', points: 50 }] as Record<string, unknown>[];
    const result = executeUpdateInMemory(docs, {
      type: 'UPDATE',
      collection: 'customers',
      filter: { _id: '1' },
      update: { $set: { points: 200 } },
    });
    expect(result[0]['points']).toBe(200); // replaced, not incremented
  });
});

describe('executeDeleteInMemory', () => {
  it('deletes single matching document', () => {
    const docs = [...sampleDocs] as Record<string, unknown>[];
    const result = executeDeleteInMemory(docs, {
      type: 'DELETE',
      collection: 'orders',
      filter: { _id: '2' },
      multi: false,
    });
    expect(result).toHaveLength(4);
    expect(result.find(d => d._id === '2')).toBeUndefined();
  });

  it('throws on deleteMany with empty filter', () => {
    const docs = [...sampleDocs] as Record<string, unknown>[];
    expect(() =>
      executeDeleteInMemory(docs, {
        type: 'DELETE',
        collection: 'orders',
        filter: {},
        multi: true,
      })
    ).toThrow('deleteMany with empty filter is not allowed');
  });

  it('deleteMany with filter removes multiple', () => {
    const docs = [...sampleDocs] as Record<string, unknown>[];
    const result = executeDeleteInMemory(docs, {
      type: 'DELETE',
      collection: 'orders',
      filter: { status: 'pending' },
      multi: true,
    });
    expect(result).toHaveLength(3);
    expect(result.every(d => d['status'] !== 'pending')).toBe(true);
  });
});

describe('executeAggregateInMemory - $group with $sum', () => {
  it('groups by status and counts', () => {
    const result = executeAggregateInMemory(sampleDocs as Record<string, unknown>[], {
      type: 'AGGREGATE',
      collection: 'orders',
      pipeline: [
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
    });

    expect(result).toHaveLength(3); // paid, pending, cancelled
    const paidGroup = result.find(r => r._id === 'paid');
    const pendingGroup = result.find(r => r._id === 'pending');
    expect(paidGroup?.['count']).toBe(2);
    expect(pendingGroup?.['count']).toBe(2);
    // sorted descending, first two have count 2
    expect(result[0]['count']).toBeGreaterThanOrEqual(result[1]['count'] as number);
  });
});
