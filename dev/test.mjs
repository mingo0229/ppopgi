// 규칙 계산(순수 함수)을 index.html에서 그대로 꺼내 검증한다.
//   node dev/test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.split('/* logic:start */')[1].split('/* logic:end */')[0];
const L = new Function(`${code}\nreturn { RULES, HOUR, DELTA, sanitize, periods, summarize, nextOpen, ledgerRows };`)();
const { RULES, HOUR, summarize, nextOpen, ledgerRows, sanitize } = L;

const at = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const play = (t) => ({ t, type: 'play' });
const win = (t, type) => ({ t, type });
const canPlay = (events, t) => summarize(events, t).canNow > 0;
const tryPlay = (events, t) => (canPlay(events, t) ? (events.push(play(t)), true) : false);
const leftOf = (events, t) => ({ ...summarize(events, t).left });

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('규칙 숫자가 요청과 같다', () => {
  assert.deepEqual({ ...RULES }, { monthly: 30, perHour: 8, perDay: 10, perWeek: 15, small: 3, big: 6, price: 1000 });
});

test('처음에는 한 달 30 · 일주일 15 · 하루 10 · 1시간 8, 지금 8회까지 가능', () => {
  const t = at(2026, 11, 20, 14, 30);
  const s = summarize([], t);
  assert.deepEqual({ ...s.left }, { month: 30, week: 15, day: 10, hour: 8 });
  assert.equal(s.remaining, 30);
  assert.equal(s.canNow, 8);
  assert.equal(s.limitedBy, 'hour');
  assert.equal(s.spent, 0);
  assert.equal(nextOpen([], t), null);
});

test('1회 할 때마다 네 가지 남은 횟수에서 1씩 차감', () => {
  const events = [];
  const t0 = at(2026, 11, 20, 14, 30);
  for (let i = 0; i < 4; i += 1) assert.ok(tryPlay(events, t0 + i * 60000));
  const s = summarize(events, t0 + 5 * 60000);
  assert.deepEqual({ ...s.left }, { month: 26, week: 11, day: 6, hour: 4 });
  assert.equal(s.spent, 4000);
});

test('인형을 뽑으면 한 달·일주일·하루·1시간 모두 작은 인형 +3, 큰 인형 +6 (기본 횟수를 넘을 수 있음)', () => {
  const t0 = at(2026, 11, 20, 14, 30);
  const events = [play(t0)];
  assert.deepEqual(leftOf(events, t0 + 500), { month: 29, week: 14, day: 9, hour: 7 });
  events.push(win(t0 + 1000, 'small'));
  assert.deepEqual(leftOf(events, t0 + 1500), { month: 32, week: 17, day: 12, hour: 10 });
  events.push(play(t0 + 2000), win(t0 + 3000, 'big'));
  const s = summarize(events, t0 + 4000);
  assert.deepEqual({ ...s.left }, { month: 37, week: 22, day: 17, hour: 15 });
  assert.equal(s.monthSmall, 1);
  assert.equal(s.monthBig, 1);
  assert.equal(s.canNow, 15);
});

test('하루 10회: 11번째는 막히고 자정에 풀린다. 인형을 뽑으면 그날 바로 다시 열린다', () => {
  const events = [];
  // 금요일 09:00부터 20분 간격 10회 → 1시간 횟수에는 걸리지 않는다
  for (let i = 0; i < 10; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 9, 0) + i * 20 * 60000));
  const t = at(2026, 11, 20, 12, 30); // 마지막 두 번(11:40, 12:00)만 최근 1시간 안
  const s = summarize(events, t);
  assert.deepEqual({ ...s.left }, { month: 20, week: 5, day: 0, hour: 6 });
  assert.equal(s.canNow, 0);
  assert.deepEqual(nextOpen(events, t), { rule: 'day', until: at(2026, 11, 21) });
  assert.equal(tryPlay(events, t), false);
  assert.equal(canPlay(events, at(2026, 11, 20, 23, 59, 59)), false);
  assert.equal(canPlay(events, at(2026, 11, 21, 0, 0, 0)), true);

  // 작은 인형을 뽑았다고 적으면 오늘 3회가 돌아온다
  events.push(win(at(2026, 11, 20, 12, 31), 'small'));
  const back = summarize(events, at(2026, 11, 20, 12, 32));
  assert.deepEqual({ ...back.left }, { month: 23, week: 8, day: 3, hour: 9 });
  assert.equal(back.canNow, 3);
  assert.equal(back.limitedBy, 'day');
  for (let i = 0; i < 3; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 12, 33 + i)));
  assert.equal(tryPlay(events, at(2026, 11, 20, 12, 40)), false);
  assert.deepEqual(nextOpen(events, at(2026, 11, 20, 12, 40)), { rule: 'day', until: at(2026, 11, 21) });
  // 다음 날에는 어제 돌려받은 횟수가 넘어오지 않는다
  assert.equal(summarize(events, at(2026, 11, 21, 9)).left.day, 10);
});

test('1시간 8회: 9번째는 막히고, 한 시간 전 기록이 빠지는 만큼만 다시 열린다', () => {
  const events = [];
  for (let i = 0; i < 8; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 14, 31 + i))); // 14:31~14:38
  const t = at(2026, 11, 20, 14, 40);
  const s = summarize(events, t);
  assert.deepEqual({ ...s.left }, { month: 22, week: 7, day: 2, hour: 0 });
  assert.deepEqual(nextOpen(events, t), { rule: 'hour', until: at(2026, 11, 20, 15, 31) }); // 첫 기록에서 1시간 뒤
  assert.equal(tryPlay(events, t), false);
  assert.equal(canPlay(events, at(2026, 11, 20, 15, 30, 59)), false);
  assert.ok(tryPlay(events, at(2026, 11, 20, 15, 31))); // 한 자리만 열린다
  assert.equal(canPlay(events, at(2026, 11, 20, 15, 31, 30)), false);
  assert.ok(tryPlay(events, at(2026, 11, 20, 15, 32))); // 다음 한 자리 → 오늘 10회째
  const after = at(2026, 11, 20, 15, 32, 30);
  assert.deepEqual(leftOf(events, after), { month: 20, week: 5, day: 0, hour: 0 });
  assert.deepEqual(nextOpen(events, after), { rule: 'day', until: at(2026, 11, 21) }); // 이제는 하루 횟수가 더 늦게 풀린다
});

test('1시간 8회: 막힌 뒤 인형을 뽑으면 그만큼 바로 더 할 수 있다', () => {
  const events = [];
  for (let i = 0; i < 8; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 14, 31 + i)));
  events.push(win(at(2026, 11, 20, 14, 40), 'small'));
  const s = summarize(events, at(2026, 11, 20, 14, 40, 30));
  assert.deepEqual({ ...s.left }, { month: 25, week: 10, day: 5, hour: 3 });
  assert.equal(s.limitedBy, 'hour');
  for (let i = 0; i < 3; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 14, 41 + i)));
  const t = at(2026, 11, 20, 14, 44);
  assert.equal(tryPlay(events, t), false);
  assert.deepEqual(nextOpen(events, t), { rule: 'hour', until: at(2026, 11, 20, 15, 31) });
});

test('1시간 횟수: 자정을 걸쳐도 최근 60분으로 센다', () => {
  const events = [];
  for (let i = 0; i < 4; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 23, 40 + i)));
  for (let i = 0; i < 4; i += 1) assert.ok(tryPlay(events, at(2026, 11, 21, 0, 5 + i)));
  const t = at(2026, 11, 21, 0, 15);
  assert.deepEqual(leftOf(events, t), { month: 22, week: 7, day: 6, hour: 0 }); // 하루 횟수는 자정에 새로 센다
  assert.deepEqual(nextOpen(events, t), { rule: 'hour', until: at(2026, 11, 21, 0, 40) });
  assert.equal(canPlay(events, at(2026, 11, 21, 0, 39, 59)), false);
  assert.equal(canPlay(events, at(2026, 11, 21, 0, 40, 0)), true);
});

test('1시간에 돌려받은 횟수는 인형을 적고 1시간이 지나면 함께 빠진다', () => {
  const events = [play(at(2026, 11, 20, 14, 38)), win(at(2026, 11, 20, 14, 38, 30), 'big')];
  assert.deepEqual(leftOf(events, at(2026, 11, 20, 14, 38, 40)), { month: 35, week: 20, day: 15, hour: 13 });
  for (let i = 0; i < 13; i += 1) assert.ok(tryPlay(events, at(2026, 11, 20, 14, 39 + i))); // 14:39~14:51
  const t = at(2026, 11, 20, 14, 52);
  assert.deepEqual(leftOf(events, t), { month: 22, week: 7, day: 2, hour: 0 });
  // 15:38:00에 첫 뽑기가 빠져 한 자리가 생기지만, 15:38:30에 인형 기록도 빠지면서 다시 닫힌다
  assert.deepEqual(nextOpen(events, t), { rule: 'hour', until: at(2026, 11, 20, 15, 38) });
  assert.equal(summarize(events, at(2026, 11, 20, 15, 38, 10)).canNow, 1);
  const later = at(2026, 11, 20, 15, 38, 30);
  assert.equal(summarize(events, later).left.hour, -5);
  assert.equal(summarize(events, later).canNow, 0);
  assert.deepEqual(nextOpen(events, later), { rule: 'hour', until: at(2026, 11, 20, 15, 44) });
  assert.equal(summarize(events, at(2026, 11, 20, 15, 44)).canNow, 1);
});

test('일주일 15회: 월~일 기준, 다음 월요일 0시에 풀린다. 인형을 뽑으면 그 주에 다시 열린다', () => {
  const events = [];
  // 2026-11-16(월)~18(수) 하루 5회씩, 1시간 간격
  for (const d of [16, 17, 18]) for (let i = 0; i < 5; i += 1) assert.ok(tryPlay(events, at(2026, 11, d, 10 + i)));
  const thu = at(2026, 11, 19, 12);
  assert.deepEqual(leftOf(events, thu), { month: 15, week: 0, day: 10, hour: 8 });
  const open = nextOpen(events, thu);
  assert.deepEqual(open, { rule: 'week', until: at(2026, 11, 23) });
  assert.equal(new Date(open.until).getDay(), 1);
  assert.equal(tryPlay(events, thu), false);
  assert.equal(canPlay(events, at(2026, 11, 22, 23, 59, 59)), false); // 일요일 밤까지 같은 주
  assert.equal(canPlay(events, at(2026, 11, 23, 0, 0, 0)), true); // 월요일 0시
  assert.equal(summarize(events, at(2026, 11, 23, 0, 0, 0)).left.week, 15);

  events.push(win(at(2026, 11, 19, 12, 5), 'big'));
  const s = summarize(events, at(2026, 11, 19, 12, 6));
  assert.deepEqual({ ...s.left }, { month: 21, week: 6, day: 16, hour: 14 });
  assert.equal(s.canNow, 6);
  assert.equal(s.limitedBy, 'week');
});

test('일요일은 그 주의 마지막 날로 센다', () => {
  const events = [play(at(2026, 11, 16, 10)), play(at(2026, 11, 22, 21))]; // 월, 일
  assert.equal(summarize(events, at(2026, 11, 22, 22)).left.week, 13);
  assert.equal(summarize(events, at(2026, 11, 23, 9)).left.week, 15);
});

test('하루와 일주일이 같이 막히면 더 늦게 풀리는 쪽을 알려 준다', () => {
  const events = [];
  for (let i = 0; i < 5; i += 1) assert.ok(tryPlay(events, at(2026, 11, 16, 9 + i))); // 월 5회
  for (let i = 0; i < 10; i += 1) assert.ok(tryPlay(events, at(2026, 11, 17, 9, 0) + i * 30 * 60000)); // 화 10회
  assert.deepEqual(nextOpen(events, at(2026, 11, 17, 20)), { rule: 'week', until: at(2026, 11, 23) });
  // 일요일에 둘 다 막힌 경우: 풀리는 시각이 같으면 일주일로 안내
  const sunday = [];
  for (let i = 0; i < 5; i += 1) sunday.push(play(at(2026, 11, 16, 9 + i)));
  for (let i = 0; i < 10; i += 1) sunday.push(play(at(2026, 11, 22, 9, 0) + i * 30 * 60000));
  assert.deepEqual(leftOf(sunday, at(2026, 11, 22, 20)), { month: 15, week: 0, day: 0, hour: 8 });
  assert.deepEqual(nextOpen(sunday, at(2026, 11, 22, 20)), { rule: 'week', until: at(2026, 11, 23) });
});

test('한 달 30회를 다 쓰면 막히고, 인형을 뽑으면 다시 풀린다', () => {
  const events = [];
  // 11월 2일(월)·3일(화) 주에 15회, 9일·10일 주에 15회 → 30회 소진
  for (const monday of [2, 9]) {
    for (let i = 0; i < 10; i += 1) assert.ok(tryPlay(events, at(2026, 11, monday, 9, 0) + i * 30 * 60000));
    for (let i = 0; i < 5; i += 1) assert.ok(tryPlay(events, at(2026, 11, monday + 1, 9 + i)));
  }
  const t = at(2026, 11, 18, 12);
  let s = summarize(events, t);
  assert.equal(s.remaining, 0);
  assert.deepEqual(nextOpen(events, t), { rule: 'month', until: at(2026, 12, 1) });
  assert.equal(tryPlay(events, t), false);

  events.push(win(t + 1000, 'big'));
  s = summarize(events, t + 2000);
  assert.deepEqual({ ...s.left }, { month: 6, week: 21, day: 16, hour: 14 });
  assert.equal(s.canNow, 6);
  assert.equal(s.limitedBy, 'month');
  for (let i = 0; i < 6; i += 1) assert.ok(tryPlay(events, t + 3000 + i * 1000));
  assert.equal(summarize(events, t + 60000).remaining, 0);
  assert.equal(tryPlay(events, t + 61000), false);
});

test('매달 1일에 30회로 새로 시작하고, 주간 횟수는 달이 바뀌어도 이어진다', () => {
  const events = [];
  // 2026-11-30은 월요일, 12-01은 화요일 (같은 주)
  for (let i = 0; i < 10; i += 1) assert.ok(tryPlay(events, at(2026, 11, 30, 9, 0) + i * 30 * 60000));
  events.push(win(at(2026, 11, 30, 15), 'big'));
  assert.deepEqual(leftOf(events, at(2026, 11, 30, 16)), { month: 26, week: 11, day: 6, hour: 8 });
  const dec = summarize(events, at(2026, 12, 1, 9));
  // 지난달에 쓴 횟수도 돌려받은 횟수도 새 달로 넘어오지 않지만, 같은 주의 횟수는 이어진다
  assert.deepEqual({ ...dec.left }, { month: 30, week: 11, day: 10, hour: 8 });
  assert.equal(dec.monthPlays, 0);
  assert.equal(dec.monthBig, 0);
  assert.equal(dec.canNow, 8);
});

test('연말과 2월 29일도 올바르게 넘어간다', () => {
  const dec = summarize([], at(2026, 12, 31, 23, 59));
  assert.equal(dec.periods.monthEnd, at(2027, 1, 1));
  assert.equal(dec.periods.dayEnd, at(2027, 1, 1));
  const leap = summarize([play(at(2028, 2, 29, 12))], at(2028, 2, 29, 13));
  assert.equal(leap.periods.monthEnd, at(2028, 3, 1));
  assert.equal(leap.remaining, 29);
  assert.equal(summarize([play(at(2028, 2, 29, 12))], at(2028, 3, 1, 0, 0)).remaining, 30);
});

test('내역: 이번 달 것만, 최신순, 줄마다 남은 횟수', () => {
  const events = [
    play(at(2026, 10, 31, 20)), // 지난달
    play(at(2026, 11, 20, 10)),
    play(at(2026, 11, 20, 10, 1)),
    win(at(2026, 11, 20, 10, 2), 'small'),
    play(at(2026, 11, 20, 10, 3)),
    win(at(2026, 11, 20, 10, 4), 'big')
  ];
  const rows = ledgerRows(events, at(2026, 11, 20, 11));
  assert.deepEqual(rows.map((r) => [r.type, r.delta, r.balance]), [
    ['big', 6, 36], ['play', -1, 30], ['small', 3, 31], ['play', -1, 28], ['play', -1, 29]
  ]);
  assert.equal(rows[0].balance, summarize(events, at(2026, 11, 20, 11)).remaining);
});

test('저장된 기록 중 형식이 틀린 것은 버린다', () => {
  const dirty = [play(1), { t: 'x', type: 'play' }, { t: 2, type: 'jackpot' }, null, win(3, 'big'), { t: Infinity, type: 'small' }];
  assert.deepEqual(sanitize(dirty), [play(1), win(3, 'big')]);
  assert.deepEqual(sanitize('nope'), []);
  assert.deepEqual(sanitize(undefined), []);
});

test('지금 가능한 횟수를 정하는 규칙을 알려 준다', () => {
  assert.equal(summarize([], at(2026, 11, 20, 14, 30)).limitedBy, 'hour'); // 30회 남았지만 1시간에 8회까지
  const week = [];
  for (const d of [16, 17]) for (let i = 0; i < 5; i += 1) week.push(play(at(2026, 11, d, 10 + i)));
  const s = summarize(week, at(2026, 11, 20, 14, 30));
  assert.equal(s.canNow, 5);
  assert.equal(s.limitedBy, 'week');
  const low = [];
  for (const d of [2, 3, 9, 10]) for (let i = 0; i < 7; i += 1) low.push(play(at(2026, 11, d, 10, i * 10)));
  const s2 = summarize(low, at(2026, 11, 20, 14, 30));
  assert.equal(s2.remaining, 2);
  assert.equal(s2.canNow, 2);
  assert.equal(s2.limitedBy, 'month');
});

test('무작위 180일 사용: 따로 짠 계산과 항상 같고, 막힘 안내 시각도 정확하다', () => {
  // 규칙 계산과 따로 짠 방식(기간 이름표를 붙여 단순 합산, 숫자도 직접 적음)으로 대조한다.
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const weekKey = (t) => {
    const d = new Date(t);
    const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
  };
  const monthKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}`; };
  const worth = { play: -1, small: 3, big: 6 };
  const model = [];
  const total = (keep) => model.reduce((sum, e) => (keep(e) ? sum + worth[e.type] : sum), 0);
  const leftAt = (t) => ({
    month: 30 + total((e) => monthKey(e.t) === monthKey(t)),
    week: 15 + total((e) => weekKey(e.t) === weekKey(t)),
    day: 10 + total((e) => dayKey(e.t) === dayKey(t)),
    hour: 8 + total((e) => e.t > t - HOUR && e.t <= t)
  });
  const openAt = (t) => Math.min(...Object.values(leftAt(t))) >= 1;

  let seed = 20261120;
  const rand = () => { // mulberry32
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  const events = [];
  let attempts = 0;
  let accepted = 0;
  let refused = 0;
  let openChecks = 0;
  let wins = 0;
  let t = at(2026, 10, 28, 9);
  const end = t + 180 * 24 * HOUR;
  while (t < end) {
    // 한 번 들르면 몰아서 여러 번 누른다. 자정 근처 방문도 섞는다.
    if (rand() < 0.25) {
      const d = new Date(t);
      t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - Math.floor(rand() * 40 * 60000);
    }
    const taps = 1 + Math.floor(rand() * 28);
    let refusedInARow = 0;
    for (let i = 0; i < taps; i += 1) {
      t += 5000 + Math.floor(rand() * 240000);
      attempts += 1;

      const want = leftAt(t);
      const s = summarize(events, t);
      assert.deepEqual({ ...s.left }, want, `남은 횟수가 다르다: ${new Date(t)}`);
      const blocked = Math.min(want.month, want.week, want.day, want.hour) <= 0;
      assert.equal(s.canNow <= 0, blocked);
      assert.equal(nextOpen(events, t) === null, !blocked);

      if (blocked) {
        refused += 1;
        refusedInARow += 1;
        if (refusedInARow === 1) {
          // 안내한 시각이 맞는지: 그 전에 상태가 바뀌는 모든 순간에는 아직 막혀 있고, 그 시각에는 열린다.
          const open = nextOpen(events, t);
          assert.ok(open.until > t);
          const moments = model.filter((e) => e.t > t - HOUR).map((e) => e.t + HOUR);
          for (let m = new Date(t); m.getTime() < open.until;) {
            m = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 1);
            moments.push(m.getTime());
          }
          for (const m of moments) if (m > t && m < open.until) assert.equal(openAt(m), false, `더 일찍 열린다: ${new Date(m)}`);
          assert.equal(openAt(open.until - 1), false);
          assert.equal(openAt(open.until), true);
          openChecks += 1;
        }
        assert.equal(tryPlay(events, t), false);
        continue;
      }
      refusedInARow = 0;
      assert.ok(tryPlay(events, t));
      model.push({ t, type: 'play' });
      accepted += 1;
      const after = leftAt(t);
      assert.ok(Math.min(after.month, after.week, after.day, after.hour) >= 0, '한도를 넘겼다');

      const luck = rand();
      if (luck < 0.17) {
        t += 1000;
        const type = luck < 0.05 ? 'big' : 'small';
        events.push(win(t, type));
        model.push({ t, type });
        wins += 1;
      }
    }
    t += Math.floor(rand() * 30 * HOUR);
  }
  // 인형을 뽑은 날에는 기본 10회를 넘겨 할 수 있어야 한다(새 규칙이 실제로 쓰였는지 확인).
  const perDay = new Map();
  for (const e of model) if (e.type === 'play') perDay.set(dayKey(e.t), (perDay.get(dayKey(e.t)) || 0) + 1);
  const busiest = Math.max(...perDay.values());
  assert.ok(busiest > 10, `돌려받은 횟수로 하루 10회를 넘긴 날이 없다: ${busiest}`);
  assert.ok(accepted > 200 && refused > 200 && openChecks > 50 && wins > 20, `표본이 부족하다: ${accepted}/${refused}/${openChecks}/${wins}`);
  console.log(`    시도 ${attempts}회 = 기록 ${accepted}회 + 막힘 ${refused}회, 인형 ${wins}개, 안내 시각 검증 ${openChecks}번, 가장 많이 한 날 ${busiest}회`);
});

console.log(`\n${passed}개 통과 (TZ=${process.env.TZ || '기본'})`);
