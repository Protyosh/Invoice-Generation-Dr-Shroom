// ═══════════════════════════════════════════════════════════
//  CONFIG
//  The script URL is set from the Settings screen and saved to
//  localStorage, so this file just defines defaults/keys.
//  (If you'd rather hardcode it for your team instead of typing
//  it once on each phone, paste your /exec URL into DEFAULT_SCRIPT_URL.)
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  DEFAULT_SCRIPT_URL: '', // e.g. 'https://script.google.com/macros/s/AKfycb.../exec'
  STORAGE_KEYS: {
    scriptUrl:   'drshroom_script_url',
    createdBy:   'drshroom_created_by',
    businessInfoCache: 'drshroom_business_info_cache',
  },
};
