-- testAccount@snapback.com's history is now persistent (never auto-purged on
-- login — see ensureDemoTestAccountSeeded in lib/demo/seed.ts). The only way
-- to wipe it back to the 5 baseline cases is this explicit admin action.
alter type admin_action add value 'reset_demo_test_account';
