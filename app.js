const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function baseStore() {
  return {
    settings: {
      shop_name: 'Book A Barber',
      shop_location: 'Add your shop location',
      shop_headline: 'Clean cuts. Easy booking.',
      shop_whatsapp: '',
      admin_pin: '1234'
    },
    counters: { barber: 2, reservation: 0 },
    barbers: [
      {
        id: 1,
        name: 'Adam',
        specialty: 'Fade & Beard',
        phone: '',
        email: '',
        pin: '1111',
        photo_url: '',
        active: true,
        schedule: defaultSchedule()
      },
      {
        id: 2,
        name: 'Leo',
        specialty: 'Classic & Style',
        phone: '',
        email: '',
        pin: '2222',
        photo_url: '',
        active: true,
        schedule: defaultSchedule()
      }
    ],
    reservations: []
  };
}

function defaultSchedule() {
  return WEEKDAYS.map((_, weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 6,
    start_time: '09:00',
    end_time: '18:00',
    slot_minutes: 30,
    break_start: '13:00',
    break_end: '14:00'
  }));
}

function loadStore() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = baseStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    const initial = baseStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

let store = loadStore();
function saveStore() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function timeToMinutes(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}
function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function weekdayFromDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).getDay();
}
function getBarber(id) {
  return store.barbers.find(b => b.id === Number(id));
}
function getReservation(id) {
  return store.reservations.find(r => r.id === Number(id));
}
function nextBarberId() {
  store.counters.barber += 1;
  return store.counters.barber;
}
function nextReservationId() {
  store.counters.reservation += 1;
  return store.counters.reservation;
}
function enrichReservation(r) {
  const barber = getBarber(r.barber_id);
  return { ...r, barber_name: barber ? barber.name : 'Unknown' };
}
function groupReservations(rows) {
  const grouped = {};
  rows.forEach(row => {
    if (!grouped[row.reservation_date]) grouped[row.reservation_date] = [];
    grouped[row.reservation_date].push(row);
  });
  return Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({ date, items: items.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time)) }));
}
function getAvailableSlots(barberId, dateStr, ignoreReservationId = null) {
  const barber = getBarber(barberId);
  if (!barber) return [];
  const day = barber.schedule.find(d => d.weekday === weekdayFromDate(dateStr));
  if (!day || !day.enabled) return [];

  const booked = new Set(store.reservations
    .filter(r => r.barber_id === Number(barberId) && r.reservation_date === dateStr && r.status !== 'cancelled' && r.id !== Number(ignoreReservationId))
    .map(r => r.reservation_time));

  const start = timeToMinutes(day.start_time);
  const end = timeToMinutes(day.end_time);
  const step = Number(day.slot_minutes || 30);
  const breakStart = day.break_start ? timeToMinutes(day.break_start) : null;
  const breakEnd = day.break_end ? timeToMinutes(day.break_end) : null;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const nowMin = today.getHours() * 60 + today.getMinutes();

  const slots = [];
  for (let t = start; t + step <= end; t += step) {
    if (breakStart !== null && breakEnd !== null && t >= breakStart && t < breakEnd) continue;
    if (dateStr === todayStr && t <= nowMin) continue;
    const slot = minutesToTime(t);
    if (booked.has(slot)) continue;
    slots.push(slot);
  }
  return slots;
}
function createReservation(data) {
  const id = nextReservationId();
  const reservation = {
    id,
    customer_number: `#${String(id).padStart(4, '0')}`,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    service: data.service,
    notes: data.notes || '',
    reservation_date: data.reservation_date,
    reservation_time: data.reservation_time,
    status: data.status || 'pending',
    barber_id: Number(data.barber_id),
    created_at: new Date().toISOString()
  };
  store.reservations.push(reservation);
  saveStore();
  return enrichReservation(reservation);
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}
function requireBarber(req, res, next) {
  if (req.session && req.session.barberId) return next();
  res.redirect('/barber/login');
}

app.use((req, res, next) => {
  res.locals.shop = store.settings;
  res.locals.admin = !!(req.session && req.session.admin);
  res.locals.barberSessionId = req.session ? req.session.barberId : null;
  next();
});

app.get('/', (req, res) => {
  res.render('customer', {
    barbers: store.barbers.filter(b => b.active).sort((a, b) => a.name.localeCompare(b.name)),
    today: new Date().toISOString().slice(0, 10),
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.get('/api/slots', (req, res) => {
  const barberId = Number(req.query.barber_id);
  const date = req.query.date;
  if (!barberId || !date) return res.json({ slots: [] });
  res.json({ slots: getAvailableSlots(barberId, date, req.query.ignore_id) });
});

app.post('/book', (req, res) => {
  const { customer_name, customer_phone, service, notes, barber_id, reservation_date, reservation_time } = req.body;
  const barberId = Number(barber_id);
  if (!customer_name || !customer_phone || !service || !barberId || !reservation_date || !reservation_time) {
    return res.redirect('/?error=Please+fill+all+required+fields');
  }
  if (!getAvailableSlots(barberId, reservation_date).includes(reservation_time)) {
    return res.redirect('/?error=That+time+is+not+available+anymore');
  }
  const reservation = createReservation({ customer_name, customer_phone, service, notes, barber_id: barberId, reservation_date, reservation_time, status: 'pending' });
  res.redirect(`/ticket/${reservation.id}`);
});

app.get('/ticket/:id', (req, res) => {
  const reservation = getReservation(req.params.id);
  if (!reservation) return res.redirect('/?error=Reservation+not+found');
  res.render('ticket', { reservation: enrichReservation(reservation) });
});

app.get('/admin/login', (req, res) => res.render('admin_login', { error: '' }));
app.post('/admin/login', (req, res) => {
  if (req.body.pin === store.settings.admin_pin) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.render('admin_login', { error: 'Wrong PIN' });
});
app.get('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.get('/admin', requireAdmin, (req, res) => {
  const reservations = store.reservations.map(enrichReservation).sort((a, b) => `${a.reservation_date} ${a.reservation_time}`.localeCompare(`${b.reservation_date} ${b.reservation_time}`));
  res.render('admin_dashboard', {
    stats: {
      totalBarbers: store.barbers.length,
      totalReservations: reservations.length,
      upcomingReservations: reservations.filter(r => ['pending', 'confirmed'].includes(r.status)).length
    },
    groupedReservations: groupReservations(reservations),
    barbers: store.barbers,
    settings: store.settings,
    weekdays: WEEKDAYS,
    message: req.query.message || '',
    error: req.query.error || ''
  });
});
app.post('/admin/settings', requireAdmin, (req, res) => {
  store.settings = {
    ...store.settings,
    shop_name: req.body.shop_name || '',
    shop_location: req.body.shop_location || '',
    shop_headline: req.body.shop_headline || '',
    shop_whatsapp: req.body.shop_whatsapp || '',
    admin_pin: req.body.admin_pin || '1234'
  };
  saveStore();
  res.redirect('/admin?message=Settings+saved');
});
app.post('/admin/barbers', requireAdmin, (req, res) => {
  const { name, specialty, phone, email, pin, photo_url } = req.body;
  if (!name || !pin) return res.redirect('/admin?error=Barber+name+and+PIN+are+required');
  store.barbers.push({
    id: nextBarberId(),
    name,
    specialty: specialty || '',
    phone: phone || '',
    email: email || '',
    pin,
    photo_url: photo_url || '',
    active: true,
    schedule: defaultSchedule()
  });
  saveStore();
  res.redirect('/admin?message=Barber+added');
});
app.get('/admin/barbers/:id/edit', requireAdmin, (req, res) => {
  const barber = getBarber(req.params.id);
  if (!barber) return res.redirect('/admin?error=Barber+not+found');
  res.render('edit_barber', { barber, schedule: barber.schedule, weekdays: WEEKDAYS });
});
app.post('/admin/barbers/:id/edit', requireAdmin, (req, res) => {
  const barber = getBarber(req.params.id);
  if (!barber) return res.redirect('/admin?error=Barber+not+found');
  barber.name = req.body.name;
  barber.specialty = req.body.specialty || '';
  barber.phone = req.body.phone || '';
  barber.email = req.body.email || '';
  barber.pin = req.body.pin;
  barber.photo_url = req.body.photo_url || '';
  barber.active = !!req.body.active;
  barber.schedule = WEEKDAYS.map((_, d) => ({
    weekday: d,
    enabled: !!req.body[`enabled_${d}`],
    start_time: req.body[`start_${d}`] || '09:00',
    end_time: req.body[`end_${d}`] || '18:00',
    slot_minutes: Number(req.body[`slot_${d}`] || 30),
    break_start: req.body[`break_start_${d}`] || '',
    break_end: req.body[`break_end_${d}`] || ''
  }));
  saveStore();
  res.redirect('/admin?message=Barber+updated');
});
app.post('/admin/barbers/:id/delete', requireAdmin, (req, res) => {
  const barber = getBarber(req.params.id);
  if (barber) {
    barber.active = false;
    saveStore();
  }
  res.redirect('/admin?message=Barber+disabled');
});
app.get('/admin/reservations/:id/edit', requireAdmin, (req, res) => {
  const reservation = getReservation(req.params.id);
  if (!reservation) return res.redirect('/admin?error=Reservation+not+found');
  res.render('edit_reservation', { reservation, barbers: store.barbers.filter(b => b.active), actionBase: '/admin', editorType: 'Admin' });
});
app.post('/admin/reservations/:id/edit', requireAdmin, (req, res) => {
  const reservation = getReservation(req.params.id);
  if (!reservation) return res.redirect('/admin?error=Reservation+not+found');
  const barberId = Number(req.body.barber_id);
  if (!getAvailableSlots(barberId, req.body.reservation_date, reservation.id).includes(req.body.reservation_time)) {
    return res.redirect('/admin?error=That+time+is+not+available');
  }
  Object.assign(reservation, {
    customer_name: req.body.customer_name,
    customer_phone: req.body.customer_phone,
    service: req.body.service,
    notes: req.body.notes || '',
    reservation_date: req.body.reservation_date,
    reservation_time: req.body.reservation_time,
    status: req.body.status,
    barber_id: barberId
  });
  saveStore();
  res.redirect('/admin?message=Reservation+updated');
});
app.post('/admin/reservations/:id/delete', requireAdmin, (req, res) => {
  store.reservations = store.reservations.filter(r => r.id !== Number(req.params.id));
  saveStore();
  res.redirect('/admin?message=Reservation+deleted');
});
app.post('/admin/reservations', requireAdmin, (req, res) => {
  const barberId = Number(req.body.barber_id);
  if (!getAvailableSlots(barberId, req.body.reservation_date).includes(req.body.reservation_time)) {
    return res.redirect('/admin?error=That+time+is+not+available');
  }
  createReservation({
    customer_name: req.body.customer_name,
    customer_phone: req.body.customer_phone,
    service: req.body.service,
    notes: req.body.notes,
    reservation_date: req.body.reservation_date,
    reservation_time: req.body.reservation_time,
    barber_id: barberId,
    status: req.body.status || 'confirmed'
  });
  res.redirect('/admin?message=Reservation+added');
});

app.get('/barber/login', (req, res) => {
  res.render('barber_login', { barbers: store.barbers.filter(b => b.active).sort((a, b) => a.name.localeCompare(b.name)), error: '' });
});
app.post('/barber/login', (req, res) => {
  const barber = getBarber(req.body.barber_id);
  const activeBarbers = store.barbers.filter(b => b.active).sort((a, b) => a.name.localeCompare(b.name));
  if (barber && barber.active && barber.pin === req.body.pin) {
    req.session.barberId = barber.id;
    return res.redirect('/barber');
  }
  res.render('barber_login', { barbers: activeBarbers, error: 'Wrong barber or PIN' });
});
app.get('/barber/logout', (req, res) => { if (req.session) delete req.session.barberId; res.redirect('/'); });
app.get('/barber', requireBarber, (req, res) => {
  const barber = getBarber(req.session.barberId);
  if (!barber) return res.redirect('/barber/login');
  const reservations = store.reservations.filter(r => r.barber_id === barber.id).map(enrichReservation).sort((a, b) => `${a.reservation_date} ${a.reservation_time}`.localeCompare(`${b.reservation_date} ${b.reservation_time}`));
  res.render('barber_dashboard', { barber, schedule: barber.schedule, weekdays: WEEKDAYS, groupedReservations: groupReservations(reservations), message: req.query.message || '', error: req.query.error || '' });
});
app.post('/barber/schedule', requireBarber, (req, res) => {
  const barber = getBarber(req.session.barberId);
  barber.schedule = WEEKDAYS.map((_, d) => ({
    weekday: d,
    enabled: !!req.body[`enabled_${d}`],
    start_time: req.body[`start_${d}`] || '09:00',
    end_time: req.body[`end_${d}`] || '18:00',
    slot_minutes: Number(req.body[`slot_${d}`] || 30),
    break_start: req.body[`break_start_${d}`] || '',
    break_end: req.body[`break_end_${d}`] || ''
  }));
  saveStore();
  res.redirect('/barber?message=Schedule+saved');
});
app.post('/barber/reservations', requireBarber, (req, res) => {
  const barberId = req.session.barberId;
  if (!getAvailableSlots(barberId, req.body.reservation_date).includes(req.body.reservation_time)) {
    return res.redirect('/barber?error=That+time+is+not+available');
  }
  createReservation({
    customer_name: req.body.customer_name,
    customer_phone: req.body.customer_phone,
    service: req.body.service,
    notes: req.body.notes,
    reservation_date: req.body.reservation_date,
    reservation_time: req.body.reservation_time,
    barber_id: barberId,
    status: req.body.status || 'confirmed'
  });
  res.redirect('/barber?message=Reservation+added');
});
app.get('/barber/reservations/:id/edit', requireBarber, (req, res) => {
  const reservation = getReservation(req.params.id);
  if (!reservation || reservation.barber_id !== req.session.barberId) return res.redirect('/barber?error=Reservation+not+found');
  res.render('edit_reservation', { reservation, barbers: [getBarber(req.session.barberId)], actionBase: '/barber', editorType: 'Barber' });
});
app.post('/barber/reservations/:id/edit', requireBarber, (req, res) => {
  const reservation = getReservation(req.params.id);
  if (!reservation || reservation.barber_id !== req.session.barberId) return res.redirect('/barber?error=Reservation+not+found');
  if (!getAvailableSlots(req.session.barberId, req.body.reservation_date, reservation.id).includes(req.body.reservation_time)) {
    return res.redirect('/barber?error=That+time+is+not+available');
  }
  Object.assign(reservation, {
    customer_name: req.body.customer_name,
    customer_phone: req.body.customer_phone,
    service: req.body.service,
    notes: req.body.notes || '',
    reservation_date: req.body.reservation_date,
    reservation_time: req.body.reservation_time,
    status: req.body.status
  });
  saveStore();
  res.redirect('/barber?message=Reservation+updated');
});
app.post('/barber/reservations/:id/delete', requireBarber, (req, res) => {
  store.reservations = store.reservations.filter(r => !(r.id === Number(req.params.id) && r.barber_id === req.session.barberId));
  saveStore();
  res.redirect('/barber?message=Reservation+deleted');
});
app.post('/barber/reservations/:id/status', requireBarber, (req, res) => {
  const reservation = getReservation(req.params.id);
  if (reservation && reservation.barber_id === req.session.barberId) {
    reservation.status = req.body.status;
    saveStore();
  }
  res.redirect('/barber?message=Status+updated');
});

app.listen(PORT, () => {
  console.log(`Book A Barber running on http://localhost:${PORT}`);
});
