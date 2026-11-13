# 03 · Test checklist: phone and laptop

The link is `http://<ip>` (from the end of the deploy log). It is plain HTTP, so a phone may show "Not secure". That is expected in this test setup.

## On the phone
- Use **mobile data or the same Wi-Fi**. Either works, the server is public.
- If the page does not open: the browser may have switched to https. Type `http://` in front of the address by hand.
- Create an account with **email and password** (the "Sign up" page). Sign-in with a one-time code also works: after asking for the code, run Jenkins `ACTION = logs` and copy the 6-digit code from the line `[OTP · development]`.

## Things to try
| Area | What to check |
|---|---|
| Home | rings, targets, mock cards fit the screen |
| Start a mock | instructions page, fullscreen prompt, timer, question palette, Save and Next |
| During a test | leaving the tab shows the warning screen, back button blocked |
| Result | score, section analysis, charts (tap bars for the details), PDF report menu |
| Toolkit and profile | forms are usable with the phone keyboard |
| Admin (`/admin`) | works on a phone: Overview, Live tests, Users, Mocks, Question bank |

## Tips
- To test a full mock quickly, a test attempt takes the full 135 minutes. Use a mock section and submit early, or start a few and look at **Live tests** in the admin.
- Fullscreen and the test lock work over HTTP. Installing the site as an app on the home screen (PWA) needs HTTPS, which this test setup does not have.
- Test on both Android Chrome and iPhone Safari if you can. iPhone Safari does not allow fullscreen for web pages, so there the test cannot be forced fullscreen. Leaving the tab is still detected.
