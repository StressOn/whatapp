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

// Get ideal and extended ranges for yesterday (21/04/2025)
function getDateRanges() {
  // Ideal day boundaries (21/04/2025 00:00:00 to 23:59:59 IST)
  const idealStart = 1743638400; // 21/04/2025 00:00:00 IST
  const idealEnd = 1743724799;   // 21/04/2025 23:59:59 IST
  
  // Extended search window (12 hours before to 12 hours after)
  const searchStart = idealStart - 43200; // 20/04/2025 12:00:00 IST
  const searchEnd = idealEnd + 43200;    // 22/04/2025 11:59:59 IST
  
  return {
    ideal: { start: idealStart, end: idealEnd },
    search: { start: searchStart, end: searchEnd },
    dateString: new Date(idealStart * 1000).toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata'})
  };
}

async function findClosestReadings() {
  const { ideal, search, dateString } = getDateRanges();
  
  console.log(`Searching for readings near ${dateString}`);
  console.log(`Ideal range: ${toIST(ideal.start)} to ${toIST(ideal.end)}`);
  console.log(`Search window: ${toIST(search.start)} to ${toIST(search.end)}`);

  // Get all readings in the extended search window
  const snapshot = await admin.database().ref('Sensor/perday/readings')
    .orderByChild('timestamp')
    .startAt(search.start)
    .endAt(search.end)
    .once('value');

  const allReadings = snapshot.val() ? Object.values(snapshot.val()) : [];
  allReadings.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Found ${allReadings.length} readings in search window`);

  // Find first reading after day start and last before day end
  const dayReadings = allReadings.filter(r => 
    r.timestamp >= ideal.start && r.timestamp <= ideal.end
  );

  // If no readings in ideal day, use closest available
  const firstReading = dayReadings[0] || 
    allReadings.find(r => r.timestamp > ideal.start) || 
    allReadings[allReadings.length - 1];
  
  const lastReading = dayReadings[dayReadings.length - 1] || 
    allReadings.reverse().find(r => r.timestamp < ideal.end) || 
    allReadings[0];

  return {
    dateString,
    firstReading,
    lastReading,
    allReadings,
    dayReadings,
    usedFallback: dayReadings.length === 0
  };
}

async function calculateProduction() {
  const { dateString, firstReading, lastReading, dayReadings, usedFallback } = await findClosestReadings();
  
  let production = 0;
  let calculation = "No usable readings found";
  let warning = "";

  if (firstReading && lastReading) {
    production = lastReading.length - firstReading.length;
    
    if (usedFallback) {
      warning = "⚠️ Used nearest available readings (device may have been offline)";
    }
    
    calculation = `Production = ${lastReading.length.toFixed(2)} (${toIST(lastReading.timestamp)}) - ${firstReading.length.toFixed(2)} (${toIST(firstReading.timestamp)}) = ${production.toFixed(2)}m`;
  }

  return {
    date: dateString,
    production: production.toFixed(2),
    calculation,
    warning,
    firstReading,
    lastReading,
    readingsInDay: dayReadings.length,
    totalReadingsFound: dayReadings.length
  };
}

async function sendReport() {
  try {
    const { date, production, calculation, warning, firstReading, lastReading, readingsInDay } = await calculateProduction();
    
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
        ${warning ? `<div style="background:#f39c12;padding:10px;border-radius:5px;margin-bottom:15px;">${warning}</div>` : ''}
        
        <table border="1" cellpadding="8" style="border-collapse:collapse;margin-bottom:20px;">
          <tr><th>Total Production</th><td><strong>${production} meters</strong></td></tr>
          <tr><th>Readings in Day</th><td>${readingsInDay}</td></tr>
        </table>
        
        <h3 style="color:#2874a6;">Calculation</h3>
        <p>${calculation}</p>
        
        ${firstReading ? `
        <h3 style="color:#2874a6;">Key Readings</h3>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr>
            <th></th>
            <th>Length (m)</th>
            <th>Time (IST)</th>
            <th>Timestamp</th>
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
