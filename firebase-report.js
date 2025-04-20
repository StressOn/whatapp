const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

// Helper to get yesterday's date range
function getYesterdayRange() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    start: new Date(yesterday.setHours(0, 0, 0, 0)).getTime() / 1000,
    end: new Date(yesterday.setHours(23, 59, 59, 999)).getTime() / 1000
  };
}

async function getYesterdayProduction() {
  const { start, end } = getYesterdayRange();
  const db = admin.database();
  
  // Get all readings from yesterday
  const snapshot = await db.ref('Sensor/perday/readings')
    .orderByChild('timestamp')
    .startAt(start)
    .endAt(end)
    .once('value');

  const readings = Object.values(snapshot.val() || {});
  
  // Calculate totals
  return {
    totalLength: readings.reduce((sum, r) => sum + (r.length || 0), 0),
    readingCount: readings.length,
    lastUpdated: new Date(readings[readings.length-1]?.timestamp * 1000 || 0)
  };
}

async function sendReport() {
  try {
    const { totalLength, readingCount, lastUpdated } = await getYesterdayProduction();
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Daily Production Report" <${process.env.SENDER_EMAIL}>`,
      to: process.env.BOSS_EMAIL,
      subject: `📊 Yesterday's Production: ${totalLength.toFixed(2)}m`,
      html: `
        <h1 style="color:#2e86c1;">Production Summary</h1>
        <h3>${lastUpdated.toDateString()}</h3>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr>
            <th>Total Length</th>
            <td>${totalLength.toFixed(2)} meters</td>
          </tr>
          <tr>
            <th>Total Readings</th>
            <td>${readingCount}</td>
          </tr>
          <tr>
            <th>Last Record</th>
            <td>${lastUpdated.toLocaleTimeString()}</td>
          </tr>
        </table>
      `
    });

    console.log(`✅ Daily report sent at ${new Date().toLocaleString()}`);
  } catch (err) {
    console.error('❌ Report failed:', err);
    process.exit(1);
  }
}

sendReport();
