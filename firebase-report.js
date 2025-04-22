const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com/"
});

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

// Get exact IST boundaries for yesterday (21/04/2025)
function getYesterdayRange() {
  // Manually set to 21 April 2025 in IST
  const start = new Date('2025-04-21T00:00:00+05:30');
  const end = new Date('2025-04-21T23:59:59+05:30');
  
  return {
    start: Math.floor(start.getTime() / 1000), // 1743638400
    end: Math.floor(end.getTime() / 1000),    // 1743724799
    dateString: start.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata'})
  };
}

async function getProductionData() {
  const { start, end, dateString } = getYesterdayRange();
  
  console.log(`Fetching data for ${dateString} (${start} to ${end})`);

  const snapshot = await admin.database().ref('Sensor/perday/readings')
    .orderByChild('timestamp')
    .startAt(start)
    .endAt(end)
    .once('value');

  const readings = snapshot.val() ? Object.values(snapshot.val()) : [];
  readings.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Found ${readings.length} readings:`);
  readings.forEach(r => console.log(`- ${r.length}m at ${toIST(r.timestamp)}`));

  let production = 0;
  let calculation = "No readings found";
  
  if (readings.length >= 2) {
    production = readings[readings.length - 1].length - readings[0].length;
    calculation = `Production = ${readings[readings.length - 1].length.toFixed(2)} (last) - ${readings[0].length.toFixed(2)} (first) = ${production.toFixed(2)}m`;
  } else if (readings.length === 1) {
    calculation = `Only one reading found: ${readings[0].length}m - cannot calculate daily production`;
  }

  return {
    date: dateString,
    production: production.toFixed(2),
    calculation,
    firstReading: readings[0],
    lastReading: readings[readings.length - 1],
    totalReadings: readings.length
  };
}

async function sendReport() {
  try {
    const { date, production, calculation, firstReading, lastReading, totalReadings } = await getProductionData();
    
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
      subject: `📊 Daily Production - ${date}`,
      html: `
        <h1 style="color:#2e86c1;">Production Report - ${date}</h1>
        
        <table border="1" cellpadding="8" style="border-collapse:collapse;margin-bottom:20px;">
          <tr><th>Total Production</th><td><strong>${production} meters</strong></td></tr>
          <tr><th>Readings Processed</th><td>${totalReadings}</td></tr>
        </table>
        
        <h3 style="color:#2874a6;">Calculation Method</h3>
        <p>${calculation}</p>
        
        ${firstReading ? `
        <h3 style="color:#2874a6;">Key Readings</h3>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr>
            <th></th>
            <th>Length (m)</th>
            <th>Timestamp (IST)</th>
            <th>Unix Time</th>
          </tr>
          <tr>
            <td><strong>First</strong></td>
            <td>${firstReading.length.toFixed(2)}</td>
            <td>${toIST(firstReading.timestamp)}</td>
            <td>${firstReading.timestamp}</td>
          </tr>
          ${lastReading !== firstReading ? `
          <tr>
            <td><strong>Last</strong></td>
            <td>${lastReading.length.toFixed(2)}</td>
            <td>${toIST(lastReading.timestamp)}</td>
            <td>${lastReading.timestamp}</td>
          </tr>
          ` : ''}
        </table>
        ` : ''}
        
        <p style="margin-top:20px;color:#7f8c8d;">
          <small>Report generated at: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}</small>
        </p>
      `
    });

    console.log(`✅ Report sent for ${date}`);
  } catch (err) {
    console.error('❌ Report failed:', err);
    process.exit(1);
  }
}

sendReport();
