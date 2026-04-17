import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverProperties, clearPropertiesCache } from '../properties';

describe('discoverProperties', () => {
  beforeEach(() => {
    clearPropertiesCache();
    vi.stubGlobal('fetch', vi.fn());
    process.env.HUBSPOT_API_KEY = 'pat-test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns property names for companies', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { name: 'name', label: 'Name', type: 'string' },
          { name: 'domain', label: 'Domain', type: 'string' },
          { name: 'turnover', label: 'Turnover', type: 'number' },
        ],
      }),
    });

    const props = await discoverProperties('companies');
    expect(props.map((p) => p.name)).toEqual(['name', 'domain', 'turnover']);
  });

  it('caches results per object type within a single run', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ name: 'x', label: 'X', type: 'string' }] }),
    });

    await discoverProperties('companies');
    await discoverProperties('companies');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws if API returns non-200', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    });

    await expect(discoverProperties('companies')).rejects.toThrow(/403/);
  });
});
