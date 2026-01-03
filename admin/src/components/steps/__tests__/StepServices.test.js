import { computeGolfTotals, syncServiceDatesFromBasics } from '../StepServices';

describe('computeGolfTotals', () => {
  test('calculates total green fees using per-person value', () => {
    const totals = computeGolfTotals({ green_fees_per_person: 4 }, 4);
    expect(totals).toEqual({ greenFeesPerPerson: 4, totalGreenFees: 16 });
  });

  test('recalculates total when pax changes', () => {
    const totals = computeGolfTotals({ green_fees_per_person: 2 }, 3);
    expect(totals.totalGreenFees).toBe(6);
  });
});

describe('syncServiceDatesFromBasics', () => {
  test('keeps green fees when syncing dates', () => {
    const services = [
      {
        service_type: 'golf',
        dates_inherited: true,
        start_date: '2024-01-01',
        end_date: '2024-01-02',
        green_fees_per_person: 3,
      },
    ];

    const synced = syncServiceDatesFromBasics(services, {
      start_date: '2024-02-01',
      end_date: '2024-02-02',
    });

    expect(synced[0].green_fees_per_person).toBe(3);
    expect(synced[0].start_date).toBe('2024-02-01');
    expect(synced[0].end_date).toBe('2024-02-02');
  });
});
