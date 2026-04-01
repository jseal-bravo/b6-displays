import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const FSP_BASE = 'https://usc-api.flightschedulepro.com/reports/v1.0';
const FSP_KEY  = '6046f08b4abc4cf4a4ddb11f178bb9a1';
const OPERATOR = '194127';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Today's date range in Mountain Time (UTC-6 MST / UTC-7 MDT)
    const now = new Date();
    // Use Intl to get current date in Mountain Time
    const mtDate = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
    // mtDate is MM/DD/YYYY
    const [mm, dd, yyyy] = mtDate.split('/');
    const todayStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    const todayEnd   = new Date(`${yyyy}-${mm}-${dd}T23:59:59`);
    // Tomorrow range
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59);

    // Fetch aircraft list (for tail numbers)
    const aircraftResp = await fetch(
      `${FSP_BASE}/operators/${OPERATOR}/aircraft?limit=200&offset=0`,
      { headers: { 'x-subscription-key': FSP_KEY } }
    );
    const aircraftData = aircraftResp.ok ? await aircraftResp.json() : { items: [] };
    const tailMap: Record<string, string> = {};
    for (const a of (aircraftData.items ?? [])) {
      if (a.aircraftId && a.registrationTail) tailMap[a.aircraftId] = a.registrationTail;
    }

    // Fetch ALL reservations (FSP ignores date params, so paginate through everything)
    let allItems: any[] = [];
    let offset = 0;
    const pageSize = 500;
    while (true) {
      const resResp = await fetch(
        `${FSP_BASE}/operators/${OPERATOR}/reservations?limit=${pageSize}&offset=${offset}`,
        { headers: { 'x-subscription-key': FSP_KEY } }
      );
      if (!resResp.ok) throw new Error(`FSP API error: ${resResp.status}`);
      const resData = await resResp.json();
      const items = resData.items ?? [];
      allItems = allItems.concat(items);
      if (items.length < pageSize) break;
      offset += pageSize;
    }

    // Filter: exclude cancelled/no-show and dispatcher entries
    const excluded = new Set(['cancelled', 'no_show', 'no show']);
    function isValid(b: any) {
      const status = (b.reservationStatus ?? '').toLowerCase().replace(/\s+/g, '_');
      if (excluded.has(status)) return false;
      // Skip dispatcher bookings (onboarding/tours, not training)
      const instr = (b.instructor ?? '').toLowerCase();
      if (instr.includes('dispatcher')) return false;
      return true;
    }

    // Today: current and upcoming only
    const todayItems = allItems.filter((b: any) => {
      if (!isValid(b)) return false;
      const start = new Date(b.start);
      if (start < todayStart || start > todayEnd) return false;
      const end = new Date(b.end ?? b.start);
      return end >= now;
    });

    // Tomorrow: all valid flights (shown when today is nearly done)
    const tomorrowItems = allItems.filter((b: any) => {
      if (!isValid(b)) return false;
      const start = new Date(b.start);
      return start >= tomorrow && start <= tomorrowEnd;
    });

    // Combine: always show today, add tomorrow if 3 or fewer today remain
    const showTomorrow = todayItems.length <= 3;
    const items = showTomorrow ? [...todayItems, ...tomorrowItems] : todayItems;

    items.sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Format for display
    const formatted = items.map((b: any) => {
      const start = new Date(b.start);
      const end   = new Date(b.end ?? b.start);
      const isCurrent = now >= start && now <= end;
      const status = (b.reservationStatus ?? 'Scheduled').toLowerCase().replace(/\s+/g, '_');

      // Format time in Mountain Time
      const time = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Denver',
        hour: 'numeric', minute: '2-digit', hour12: true
      }).format(start);

      // Student: first name + last initial
      const rawStudent = b.customerLabel1Name ?? b.customer ?? b.customerName ?? '';
      const studentParts = rawStudent.trim().split(/\s+/);
      const student = studentParts.length >= 2
        ? `${studentParts[0]} ${studentParts[studentParts.length - 1][0]}.`
        : rawStudent;

      // Instructor: last name only
      const rawInstructor = b.instructor ?? '';
      const instrParts = rawInstructor.trim().split(/\s+/);
      const instructor = instrParts.length >= 2
        ? instrParts[instrParts.length - 1]
        : rawInstructor;

      const tail = tailMap[b.aircraftId] ?? b.aircraftId ?? '—';

      // Day label for section headers
      const startDate = new Date(b.start);
      const isToday = startDate >= todayStart && startDate <= todayEnd;
      const day = isToday ? 'today' : 'tomorrow';

      return { time, tail, student, instructor, status, is_current: isCurrent, day };
    });

    return new Response(JSON.stringify(formatted), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fsp-schedule error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
