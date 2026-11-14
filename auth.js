/* SmartPark - login system: phone number + demo OTP
 *
 * Flow:  choose side (driver / owner)  ->  enter phone  ->  enter OTP  ->
 *        first time only: enter name + location  ->  logged in.
 *
 * DEMO OTP: no SMS is sent. The 6-digit OTP is shown on screen so the login can be
 * showcased anywhere without an SMS service. (To use real SMS later, only requestOtp and
 * verifyOtp need to change - for example Firebase, MSG91, Twilio Verify or Supabase.)
 *
 * Driver and owner accounts are separate: the same phone number can be registered once as a
 * driver and once as an owner, and each side only sees its own screens and data.
 *
 * The rest of the app only uses: requestOtp, verifyOtp, saveProfile, logout, current, isDemo.
 * requestOtp and verifyOtp return Promises.
 */
(function () {
  'use strict';

  var KEY_USERS = 'smartpark_users_v2';
  var KEY_SESSION = 'smartpark_session_v2';
  var ROLES = ['driver', 'owner'];
  var OTP_TTL_MS = 5 * 60 * 1000;   // an OTP is valid for 5 minutes
  var RESEND_SEC = 10;              // the Resend button unlocks after 10 seconds
  var MAX_TRIES = 5;                // wrong guesses allowed per OTP

  var pending = null;               // memory only: the OTP request in progress

  /* ---------- small helpers ---------- */
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v || fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function randomInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  function fail(msg) { return { ok: false, error: msg }; }
  function isRole(r) { return ROLES.indexOf(r) !== -1; }

  // Accepts 9876543210, +91 98765 43210, 09876543210 ... returns "+919876543210" or null.
  function normPhone(raw) {
    var d = String(raw || '').replace(/[\s\-()]/g, '');
    if (d.indexOf('+91') === 0) { d = d.slice(3); }
    else if (d.indexOf('91') === 0 && d.length === 12) { d = d.slice(2); }
    else if (d.charAt(0) === '0' && d.length === 11) { d = d.slice(1); }
    return /^[6-9][0-9]{9}$/.test(d) ? '+91' + d : null;
  }

  function publicUser(u) {
    return {
      id: u.id, role: u.role, phone: u.phone, name: u.name || '',
      area: u.area || '', lat: u.lat == null ? null : u.lat, lng: u.lng == null ? null : u.lng,
      profileComplete: !!u.profileComplete
    };
  }
  function findUser(users, role, phone) {
    for (var i = 0; i < users.length; i++) {
      if (users[i].role === role && users[i].phone === phone) { return users[i]; }
    }
    return null;
  }

  /* ---------- step 1: send OTP (demo: shown on screen) ---------- */
  function requestOtp(role, phoneRaw) {
    if (!isRole(role)) { return Promise.resolve(fail('Please choose Driver or Owner.')); }
    var phone = normPhone(phoneRaw);
    if (!phone) { return Promise.resolve(fail('Enter a valid 10-digit mobile number.')); }
    var code = String(100000 + randomInt(900000));
    pending = { role: role, phone: phone, code: code, expires: Date.now() + OTP_TTL_MS, tries: 0 };
    return Promise.resolve({ ok: true, phone: phone, demo: true, demoOtp: code, resendIn: RESEND_SEC });
  }

  /* ---------- step 2: check OTP, log in (or create the account) ---------- */
  function finishLogin(role, phone) {
    var users = load(KEY_USERS, []);
    var user = findUser(users, role, phone);
    var isNew = false;
    if (!user) {
      isNew = true;
      user = {
        id: (role === 'owner' ? 'o_' : 'd_') + Date.now().toString(36) + randomInt(46656).toString(36),
        role: role, phone: phone, name: '', area: '', lat: null, lng: null,
        profileComplete: false, created: Date.now()
      };
      users.push(user);
      if (!save(KEY_USERS, users)) { return fail('Could not save your account (browser storage is blocked).'); }
    }
    save(KEY_SESSION, { id: user.id });
    return { ok: true, user: publicUser(user), isNew: isNew };
  }

  function verifyOtp(role, phoneRaw, codeRaw) {
    var phone = normPhone(phoneRaw);
    var code = String(codeRaw || '').trim();
    if (!pending || !phone || pending.phone !== phone || pending.role !== role) {
      return Promise.resolve(fail('Please request an OTP first.'));
    }
    if (!/^[0-9]{6}$/.test(code)) { return Promise.resolve(fail('Enter the 6-digit OTP.')); }
    if (Date.now() > pending.expires) { pending = null; return Promise.resolve(fail('That OTP has expired. Please request a new one.')); }
    if (code !== pending.code) {
      pending.tries++;
      var left = MAX_TRIES - pending.tries;
      if (left <= 0) { pending = null; return Promise.resolve(fail('Too many wrong attempts. Please request a new OTP.')); }
      return Promise.resolve(fail('Wrong OTP. ' + left + (left === 1 ? ' try' : ' tries') + ' left.'));
    }
    pending = null;
    return Promise.resolve(finishLogin(role, phone));
  }

  /* ---------- step 3 (first login): name + location ---------- */
  function saveProfile(data) {
    var s = load(KEY_SESSION, null);
    if (!s || !s.id) { return fail('Please log in first.'); }
    var name = String(data.name || '').trim();
    var area = String(data.area || '').trim();
    var lat = data.lat == null || data.lat === '' ? null : Number(data.lat);
    var lng = data.lng == null || data.lng === '' ? null : Number(data.lng);
    if (name.length < 2) { return fail('Please enter your name.'); }
    if (area.length < 2) { return fail('Please enter your area or city.'); }
    if ((lat !== null && !isFinite(lat)) || (lng !== null && !isFinite(lng))) { return fail('Invalid location.'); }
    var users = load(KEY_USERS, []);
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === s.id) {
        users[i].name = name.slice(0, 60);
        users[i].area = area.slice(0, 100);
        users[i].lat = lat; users[i].lng = lng;
        users[i].profileComplete = true;
        if (!save(KEY_USERS, users)) { return fail('Could not save (browser storage is blocked).'); }
        return { ok: true, user: publicUser(users[i]) };
      }
    }
    return fail('Account not found. Please log in again.');
  }

  function logout() {
    pending = null;
    try { localStorage.removeItem(KEY_SESSION); } catch (e) { /* ignore */ }
  }

  // The logged-in user (or null), always re-checked against the stored accounts.
  function current() {
    var s = load(KEY_SESSION, null);
    if (!s || !s.id) { return null; }
    var users = load(KEY_USERS, []);
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === s.id) { return publicUser(users[i]); }
    }
    return null;
  }

  window.SmartAuth = {
    requestOtp: requestOtp, verifyOtp: verifyOtp, saveProfile: saveProfile,
    logout: logout, current: current,
    isDemo: function () { return true; },
    ROLES: ROLES
  };
})();
