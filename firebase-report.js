const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

// Accurate date handling for IST (UTC+5:30)
function getYesterdayIST() {
  const now = new Date();
  const istOffset = 330 * 60 * 1000; // 5.5 hours in milliseconds
  const yesterday = new Date(now - 86400000 + istOffset);
  
  return {
    start: Math.floor(yesterday.setHours(0, 0, 0, 0) / 1000),
    end: Math.floor(yesterday.setHours(23, 59, 59, 999) / 1000),
    dateString: yesterday.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata'})
  };
}

async function getYesterdayProduction() {
  const { start, end, dateString } = getYesterdayIST();
  console.log(`Fetching data from ${new Date(start * 1000)} to ${new Date(end * 1000)}`);

  const snapshot = await admin.database().ref('Sensor/perday/readings')
    .orderByChild('timestamp')
    .startAt(start)
    .endAt(end)
    .once('value');

  const readings = Object.values(snapshot.val() || {});
  const totalLength = readings.reduce((sum, r) => sum + (r.length || 0), 0);

  return {
    date: dateString,
    totalLength,
    readingCount: readings.length,
    sampleData: readings.slice(0, 3) // First 3 readings for verification
  };
}

async function sendReport() {
  try {
    const { date, totalLength, readingCount, sampleData } = await getYesterdayProduction();
    
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
      subject: `📊 Production Report for ${date}`,
      html: `
        <h1 style="color:#2e86c1;">Production Summary</h1>
        <h3>Date: ${date}</h3>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr><th>Total Length</th><td>${totalLength.toFixed(2)} meters</td></tr>
          <tr><th>Total Readings</th><td>${readingCount}</td></tr>
        </table>
        <h4>Sample Data Verification:</h4>
        <pre>${JSON.stringify(sampleData, null, 2)}</pre>
      `
    });

    console.log(`✅ Report sent at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
  } catch (err) {
    console.error('❌ Report failed:', err);
    process.exit(1);
  }
}

sendReport();
