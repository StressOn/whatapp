const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com/"
});

// CONSTANTS
const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30 in milliseconds

// Convert timestamp to IST string
function toIST(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Get yesterday's readings from Sensor/readings
async function getYesterdayReadings() {
  const now = new Date();
  const yesterdayIST = new Date(now.getTime() + IST_OFFSET - 86400000);

  const dateString = yesterdayIST.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Get yesterday's 00:00:00 and 23:59:59 IST timestamps
  yesterdayIST.setHours(0, 0, 0, 0);
  const yesterdayStart = Math.floor(yesterdayIST.getTime() / 1000);
  const yesterdayEnd = yesterdayStart + 86399;

  console.log(`Fetching yesterday's data (${dateString}): ${yesterdayStart} to ${yesterdayEnd}`);

  const snapshot = await admin.database().ref('Sensor/readings')
    .orderByChild('timestamp')
    .startAt(yesterdayStart)
    .endAt(yesterdayEnd)
    .once('value');

  const readings = snapshot.val() ? Object.values(snapshot.val()) : [];
  readings.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Found ${readings.length} readings for ${dateString}`);
  return { dateString, readings };
}

async function generateReport() {
  try {
    const { dateString, readings } = await getYesterdayReadings();

    let production = 0;
    let calculation = "No production data available";
    let firstReading = null;
    let lastReading = null;

    if (readings.length >= 2) {
      firstReading = readings[0];
      lastReading = readings[readings.length - 1];
      production = lastReading.length - firstReading.length;
      calculation = `Production = ${lastReading.length.toFixed(2)}m (${toIST(lastReading.timestamp)}) - ${firstReading.length.toFixed(2)}m (${toIST(firstReading.timestamp)}) = ${production.toFixed(2)}m`;
    } else if (readings.length === 1) {
      firstReading = lastReading = readings[0];
      calculation = `Only one reading found: ${firstReading.length.toFixed(2)}m at ${toIST(firstReading.timestamp)}`;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Production Report" <${process.env.SENDER_EMAIL}>`,
      to: process.env.BOSS_EMAIL,
      subject: `📊 Production Report - ${dateString}`,
      html: `
        <h1 style="color:#2e86c1;">Production Report - ${dateString}</h1>
        
        <table border="1" cellpadding="8" style="border-collapse:collapse;margin-bottom:20px;">
          <tr><th>Total Production</th><td><strong>${production.toFixed(2)} meters</strong></td></tr>
          <tr><th>Readings Used</th><td>${readings.length}</td></tr>
        </table>
        
        <h3 style="color:#2874a6;">Calculation Method</h3>
        <p>${calculation}</p>
        
        ${firstReading ? `
        <h3 style="color:#2874a6;">Key Readings</h3>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr>
            <th>Reading</th>
            <th>Length (m)</th>
            <th>Time (IST)</th>
            <th>Timestamp</th>
          </tr>
          <tr>
            <td>${readings.length === 1 ? 'Only' : 'First'} Reading</td>
            <td>${firstReading.length.toFixed(2)}</td>
            <td>${toIST(firstReading.timestamp)}</td>
            <td>${firstReading.timestamp}</td>
          </tr>
          ${readings.length > 1 ? `
          <tr>
            <td>Last Reading</td>
            <td>${lastReading.length.toFixed(2)}</td>
            <td>${toIST(lastReading.timestamp)}</td>
            <td>${lastReading.timestamp}</td>
          </tr>
          ` : ''}
        </table>
        ` : ''}
        
        <p style="margin-top:20px;color:#7f8c8d;">
          <small>Report generated at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</small>
        </p>
      `
    });

    console.log(`\n✅ REPORT GENERATED FOR ${dateString}`);
    console.log(`- Production: ${production.toFixed(2)}m`);
    console.log(`- Calculation: ${calculation}`);

  } catch (error) {
    console.error('\n❌ REPORT FAILED:', error);
    process.exit(1);
  }
}

// Execute the report
generateReport();
