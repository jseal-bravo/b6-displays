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

    // Fetch aircraft list (for tail numbers)
    const aircraftResp = await fetch(
      `${FSP_BASE}/operators/${OPERATOR}/aircraft?limit=200&offset=0`,
      { headers: { 'x-subscription-key': FSP_KEY } }
    );
    const aircraftData = aircraftResp.ok ? await aircraftResp.json() : { items: [] };
    const tailMap: Record<string, string> = {};
    for (const a of (aircraftData.items ?? [])) {
      if (a.aircraftId && a.tailNumber) tailMap[a.aircraftId] = a.tailNumber;
    }

    // Fetch today's reservations (try with date params, fallback to filtering)
    const params = new URLSearchParams({
      limit: '200',
      offset: '0',
      startDate: `${yyyy}-${mm}-${dd}`,
      endDate: `${yyyy}-${mm}-${dd}`,
    });
    const resResp = await fetch(
      `${FSP_BASE}/operators/${OPERATOR}/reservations?${params}`,
      { headers: { 'x-subscription-key': FSP_KEY } }
    );
    if (!resResp.ok) {
      throw new Error(`FSP API error: ${resResp.status}`);
    }
    const resData = await resResp.json();
    const allItems: any[] = resData.items ?? [];

    // Filter to today (Mountain Time) and exclude cancelled/no-show
    const excluded = new Set(['cancelled', 'no_show', 'no show']);
    const items = allItems.filter((b: any) => {
      const status = (b.reservationStatus ?? '').toLowerCase().replace(/\s+/g, '_');
      if (excluded.has(status)) return false;
      // Ensure it falls within today (in case API ignores date params)
      const start = new Date(b.start);
      return start >= todayStart && start <= todayEnd;
    });

    // Sort by start time
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

      // Student: last name + first initial, or full name if short
      const rawStudent = b.customer ?? b.customerName ?? '';
      const studentParts = rawStudent.trim().split(/\s+/);
      const student = studentParts.length >= 2
        ? `${studentParts[studentParts.length - 1]}, ${studentParts[0][0]}.`
        : rawStudent;

      // Instructor: last name only
      const rawInstructor = b.instructor ?? '';
      const instrParts = rawInstructor.trim().split(/\s+/);
      const instructor = instrParts.length >= 2
        ? instrParts[instrParts.length - 1]
        : rawInstructor;

      const tail = tailMap[b.aircraftId] ?? b.aircraftId ?? '—';

      return { time, tail, student, instructor, status, is_current: isCurrent };
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
