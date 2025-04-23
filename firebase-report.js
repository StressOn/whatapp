const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com/"
});

// CONSTANTS
const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30 in milliseconds

// Convert timestamp to IST string with full details
function toDetailedIST(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// Get precise date range for yesterday in IST
function getYesterdayRange() {
  const now = new Date();
  const nowUTC = now.getTime() + (now.getTimezoneOffset() * 60000);
  const nowIST = new Date(nowUTC + IST_OFFSET);
  
  // Yesterday in IST
  const yesterdayIST = new Date(nowIST);
  yesterdayIST.setDate(nowIST.getDate() - 1);
  
  // Start of yesterday (00:00:00)
  const start = new Date(yesterdayIST);
  start.setHours(0, 0, 0, 0);
  
  // End of yesterday (23:59:59)
  const end = new Date(yesterdayIST);
  end.setHours(23, 59, 59, 999);
  
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
    dateString: yesterdayIST.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata'})
  };
}

async function fetchProductionData() {
  const { start, end, dateString } = getYesterdayRange();
  
  console.log(`\n=== FETCHING DATA FOR ${dateString} ===`);
  console.log(`Exact range in IST: ${toDetailedIST(start)} to ${toDetailedIST(end)}`);
  console.log(`Timestamp range: ${start} to ${end}\n`);

  try {
    const snapshot = await admin.database().ref('Sensor/perday/readings')
      .orderByChild('timestamp')
      .startAt(start)
      .endAt(end)
      .once('value');

    const readings = snapshot.val() ? Object.values(snapshot.val()) : [];
    readings.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`Found ${readings.length} readings within exact range:`);
    readings.forEach(r => {
      console.log(`- ${r.length}m at ${toDetailedIST(r.timestamp)} (${r.timestamp})`);
    });

    // If no readings in exact range, search wider window
    if (readings.length === 0) {
      const widerStart = start - 86400; // 24 hours before
      const widerEnd = end + 86400;    // 24 hours after
      
      console.log(`\nNo readings found in exact range. Searching wider window (${widerStart} to ${widerEnd})`);
      
      const widerSnapshot = await admin.database().ref('Sensor/perday/readings')
        .orderByChild('timestamp')
        .startAt(widerStart)
        .endAt(widerEnd)
        .once('value');

      const widerReadings = widerSnapshot.val() ? Object.values(widerSnapshot.val()) : [];
      widerReadings.sort((a, b) => a.timestamp - b.timestamp);

      console.log(`Found ${widerReadings.length} readings in wider window:`);
      widerReadings.forEach(r => {
        console.log(`- ${r.length}m at ${toDetailedIST(r.timestamp)} (${r.timestamp})`);
      });

      return {
        dateString,
        readings: widerReadings,
        usedWiderRange: true,
        exactRangeReadings: 0
      };
    }

    return {
      dateString,
      readings,
      usedWiderRange: false,
      exactRangeReadings: readings.length
    };
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}

async function generateReport() {
  try {
    const { dateString, readings, usedWiderRange, exactRangeReadings } = await fetchProductionData();
    
    let production = 0;
    let calculation = "No readings available";
    let warning = "";
    let firstReading = null;
    let lastReading = null;

    if (readings.length > 0) {
      firstReading = readings[0];
      lastReading = readings[readings.length - 1];
      production = lastReading.length - firstReading.length;
      
      calculation = `Production = ${lastReading.length.toFixed(2)}m (${toDetailedIST(lastReading.timestamp)}) - ${firstReading.length.toFixed(2)}m (${toDetailedIST(firstReading.timestamp)}) = ${production.toFixed(2)}m`;
      
      if (usedWiderRange) {
        warning = `⚠️ Used nearest available readings (${exactRangeReadings} readings found in exact date range)`;
      }
    }

    // Email content
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
        <style>
          .header { color: #2c3e50; }
          .warning { background: #f39c12; padding: 10px; border-radius: 5px; }
          table { border-collapse: collapse; margin: 15px 0; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .footer { color: #7f8c8d; font-size: 0.9em; }
        </style>

        <h1 class="header">Production Report - ${dateString}</h1>
        
        ${warning ? `<div class="warning">${warning}</div>` : ''}
        
        <table>
          <tr><th>Total Production</th><td><strong>${production.toFixed(2)} meters</strong></td></tr>
          <tr><th>Readings Processed</th><td>${readings.length}</td></tr>
          <tr><th>Exact Date Range Readings</th><td>${exactRangeReadings}</td></tr>
        </table>
        
        <h2 class="header">Calculation Method</h2>
        <p>${calculation || 'No calculation possible'}</p>
        
        ${firstReading ? `
        <h2 class="header">Key Readings</h2>
        <table>
          <tr>
            <th>Reading</th>
            <th>Length (m)</th>
            <th>Timestamp (IST)</th>
            <th>Unix Time</th>
          </tr>
          <tr>
            <td>First Available</td>
            <td>${firstReading.length.toFixed(2)}</td>
            <td>${toDetailedIST(firstReading.timestamp)}</td>
            <td>${firstReading.timestamp}</td>
          </tr>
          <tr>
            <td>Last Available</td>
            <td>${lastReading.length.toFixed(2)}</td>
            <td>${toDetailedIST(lastReading.timestamp)}</td>
            <td>${lastReading.timestamp}</td>
          </tr>
        </table>
        ` : ''}
        
        <p class="footer">Report generated at: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}</p>
      `
    });

    console.log(`\n✅ REPORT SUMMARY FOR ${dateString}`);
    console.log(`- Production: ${production.toFixed(2)} meters`);
    console.log(`- Readings used: ${readings.length}`);
    console.log(`- Calculation: ${calculation}`);
    if (warning) console.log(`- Warning: ${warning}`);
  } catch (error) {
    console.error('\n❌ REPORT GENERATION FAILED:', error);
    process.exit(1);
  }
}

// Execute the report
generateReport();
