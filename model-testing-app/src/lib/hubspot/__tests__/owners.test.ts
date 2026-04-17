import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveOwnerName, clearOwnersCache } from '../owners';

describe('resolveOwnerName', () => {
  beforeEach(() => {
    clearOwnersCache();
    vi.stubGlobal('fetch', vi.fn());
    process.env.HUBSPOT_API_KEY = 'pat-test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns display name from HubSpot owner response', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '12345',
        firstName: 'Alex',
        lastName: 'Lundberg',
        email: 'alex@rockcap.uk',
      }),
    });

    const name = await resolveOwnerName('12345');
    expect(name).toBe('Alex Lundberg');
  });

  it('returns null if ownerId is empty or undefined', async () => {
    expect(await resolveOwnerName(undefined)).toBeNull();
    expect(await resolveOwnerName('')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null and does not throw on 404', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });

    const name = await resolveOwnerName('99999');
    expect(name).toBeNull();
  });

  it('caches by ownerId', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ firstName: 'Test', lastName: 'User' }),
    });

    await resolveOwnerName('1');
    await resolveOwnerName('1');
    await resolveOwnerName('2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to email when names missing', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: 'anon@example.com' }),
    });

    expect(await resolveOwnerName('42')).toBe('anon@example.com');
  });
});
