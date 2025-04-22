const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com/"
});

// Get exact IST date boundaries for yesterday
function getYesterdayIST() {
  // Current time in IST (UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
  const nowIST = new Date(now.getTime() + istOffset);
  
  // Yesterday in IST
  const yesterdayIST = new Date(nowIST);
  yesterdayIST.setDate(nowIST.getDate() - 1);
  yesterdayIST.setHours(0, 0, 0, 0);
  
  const start = Math.floor(yesterdayIST.getTime() / 1000);
  const end = start + 86399; // 23:59:59 same day
  
  return {
    start,
    end,
    dateString: yesterdayIST.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata'})
  };
}

async function getDailyProduction() {
  const { start, end, dateString } = getYesterdayIST();
  
  console.log(`Querying range: ${new Date(start * 1000).toLocaleString('en-IN')} (${start}) to ${new Date(end * 1000).toLocaleString('en-IN')} (${end})`);

  const snapshot = await admin.database().ref('Sensor/perday/readings')
    .orderByChild('timestamp')
    .startAt(start)
    .endAt(end)
    .once('value');

  const readingsObj = snapshot.val() || {};
  const readings = Object.values(readingsObj);
  readings.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Found ${readings.length} readings for ${dateString}`);
  readings.forEach(r => {
    console.log(`- ${r.length}m at ${new Date(r.timestamp * 1000).toLocaleString('en-IN')} (${r.timestamp})`);
  });

  let dailyProduction = 0;
  let calculation = "No readings found";
  
  if (readings.length > 0) {
    dailyProduction = readings[readings.length - 1].length - readings[0].length;
    calculation = `${readings[readings.length - 1].length.toFixed(2)} (last) - ${readings[0].length.toFixed(2)} (first) = ${dailyProduction.toFixed(2)}m`;
  }

  return {
    date: dateString,
    dailyProduction,
    readingCount: readings.length,
    calculation,
    sampleReadings: readings.length > 0 ? [readings[0], readings[readings.length - 1]] : []
  };
}

async function sendReport() {
  try {
    const { date, dailyProduction, readingCount, calculation, sampleReadings } = await getDailyProduction();
    
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
      subject: `📊 Production for ${date}`,
      html: `
        <h1>Production Summary - ${date}</h1>
        <table border="1" cellpadding="8">
          <tr><th>Total Production</th><td>${dailyProduction.toFixed(2)} meters</td></tr>
          <tr><th>Readings Count</th><td>${readingCount}</td></tr>
        </table>
        <h3>Calculation:</h3>
        <p>${calculation}</p>
        ${sampleReadings.length > 0 ? `
        <h3>Key Readings:</h3>
        <table border="1" cellpadding="8">
          <tr>
            <th>Type</th>
            <th>Length</th>
            <th>Time (IST)</th>
            <th>Timestamp</th>
          </tr>
          <tr>
            <td>First</td>
            <td>${sampleReadings[0].length.toFixed(2)}m</td>
            <td>${new Date(sampleReadings[0].timestamp * 1000).toLocaleString('en-IN')}</td>
            <td>${sampleReadings[0].timestamp}</td>
          </tr>
          <tr>
            <td>Last</td>
            <td>${sampleReadings[1].length.toFixed(2)}m</td>
            <td>${new Date(sampleReadings[1].timestamp * 1000).toLocaleString('en-IN')}</td>
            <td>${sampleReadings[1].timestamp}</td>
          </tr>
        </table>
        ` : ''}
        <p><small>Report generated at: ${new Date().toLocaleString('en-IN')}</small></p>
      `
    });

    console.log(`✅ Report sent for ${date}`);
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
}

sendReport();
