# Sending each registrant their admit card on WhatsApp

The flow: your Apps Script registers someone, emails the admit card, **and posts the registration to the CRM**. The CRM adds them to a
database list, which starts a database automation whose first message is a WhatsApp template carrying their own admit card PDF.

## One-time setup in the CRM
1. **Database:** create a list, e.g. "Registrations", and tick *agreed to WhatsApp* (registering is your basis for contacting them).
2. **Webhook:** Settings → Integrations → Custom webhooks → new endpoint. Set **Send these to → A database** and choose "Registrations".
   Copy the URL and signing secret (and turn on the authentication key if you prefer a header key to a signature).
3. **Template:** in WhatsApp Manager create a **Utility** template with a **Document** header, e.g. body
   "Hi {{1}}, your admit card for {{2}} is attached." Wait for Meta's approval.
4. **Automation:** WhatsApp → Automations → New → *Who it's for: People in the database* → *What starts it: When somebody is added to a
   database* → tick "Registrations". Add a first step **Send a template**, choose the template, tick **Attach this person's own document
   (admit card)**. Add any later steps (wait for reply, reminders…). Switch it on.

## In your Apps Script, after the email is sent
```javascript
function sendToCrm_(name, phone, email, examName, admitCardFile) {
  // Anyone with the link can open it: WhatsApp fetches the file itself.
  admitCardFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var link = 'https://drive.google.com/uc?export=download&id=' + admitCardFile.getId();

  var body = JSON.stringify({
    submission_id: phone + '-' + examName,        // same person + exam never sends twice
    name: name,
    phone: phone,
    email: email,
    exams: examName,
    admit_card_url: link,                          // becomes the message's attached document
    admit_card_name: 'Admit card - ' + name + '.pdf'
  });
  var signature = Utilities.computeHmacSha256Signature(body, 'YOUR_SIGNING_SECRET')
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');

  UrlFetchApp.fetch('YOUR_WEBHOOK_URL', {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'X-AFD-Signature': 'sha256=' + signature },
    muteHttpExceptions: true
  });
}
```
Call it right after `MailApp.sendEmail(...)`. Use the field names above or add your own under the webhook's "Extra field names".

## Things to know
- The first message **must be an approved template**; free-form messages only work after the person replies.
- The link must be **https** and publicly reachable. Small Drive PDFs work; if WhatsApp can't fetch one the delivery shows as failed on the
  automation page — host the PDF on your own site instead.
- Someone with no link, an invalid number, an opt-out, or marked do-not-contact is skipped, with the reason on the run.
- Only people added **after** the automation is switched on are messaged; the same person is never run through it twice.
