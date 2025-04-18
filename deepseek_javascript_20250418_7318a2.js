const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase with your credentials
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

async function generateReport() {
  try {
    // 1. Fetch data from Firebase Realtime Database
    const snapshot = await admin.database().ref('/').once('value');
    const data = snapshot.val();

    // 2. Generate simple HTML report
    const html = `
      <html>
        <body>
          <h1>Firebase Report</h1>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </body>
      </html>
    `;

    // 3. Save report
    fs.writeFileSync('report.html', html);
    console.log("Report generated!");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

generateReport();