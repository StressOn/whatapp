const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert('./serviceAccount.json'),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

async function generate() {
  const snapshot = await admin.database().ref('/').once('value');
  fs.writeFileSync('report.html', `<pre>${JSON.stringify(snapshot.val(), null, 2)}</pre>`);
  console.log('Report generated!');
}

generate().catch(console.error);
