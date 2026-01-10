/**
 * This script can't directly trigger Nimbus alerts (they run client-side),
 * but it can create data that will trigger alerts when the page loads.
 *
 * To test multiple Nimbus alerts:
 * 1. Open browser console on the dashboard
 * 2. Run: window.testNimbus('happy', 'First message')
 * 3. Quickly run: window.testNimbus('talking', 'Second message')
 * 4. Quickly run: window.testNimbus('concerned', 'Third message')
 *
 * You should see "1 of 3" with navigation arrows!
 */

console.log(`
=== Testing Multiple Nimbus Alerts ===

To test the new queue navigation feature:

1. Open your browser's Developer Console (F12 or Cmd+Option+I)

2. Navigate to the dashboard

3. Paste and run these commands quickly (within 1-2 seconds):

   window.testNimbus('happy', 'First notification - Email draft created!')
   window.testNimbus('talking', 'Second notification - Lead enrolled in funnel!')
   window.testNimbus('concerned', 'Third notification - Call needs follow-up!')

4. You should see Nimbus appear with navigation:
   - "1 of 3" counter at the bottom
   - Left/Right arrows to browse notifications
   - Each notification has its own content and actions

Alternatively, trigger real notifications by:
- Processing a call that matches a funnel (creates enrollment alert)
- Processing a call where rep promised to send docs (creates email draft alert)
- Both happening together will show the queue navigation!
`)
