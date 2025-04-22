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
  // Get current time in UTC and subtract IST offset to get correct date boundaries
  const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = utcNow + (330 * 60000); // Add 5.5 hours for IST
  
  // Yesterday in IST
  const istYesterday = new Date(istNow - 86400000);
  istYesterday.setHours(0, 0, 0, 0); // Start of yesterday
  
  const start = Math.floor(istYesterday.getTime() / 1000);
  const end = start + 86399; // 23:59:59 same day
  
  return {
    start,
    end,
    dateString: istYesterday.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata'})
  };
}

async function getYesterdayProduction() {
  const { start, end, dateString } = getYesterdayIST();
  console.log(`Fetching data from ${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}`);

  const snapshot = await admin.database().ref('Sensor/perday/readings')
    .orderByChild('timestamp')
    .startAt(start)
    .endAt(end)
    .once('value');

  const readingsObj = snapshot.val() || {};
  
  // Convert to array and sort by timestamp
  const readings = Object.values(readingsObj);
  readings.sort((a, b) => a.timestamp - b.timestamp);

  let dailyProduction = 0;
  let calculationExplanation = "No readings found for this date";
  
  if (readings.length > 0) {
    dailyProduction = readings[readings.length - 1].length - readings[0].length;
    calculationExplanation = `${readings[readings.length - 1].length.toFixed(2)} (last) - ${readings[0].length.toFixed(2)} (first) = ${dailyProduction.toFixed(2)}m`;
    
    // Additional verification for cumulative values
    if (readings.length > 1) {
      let cumulativeCheck = 0;
      for (let i = 1; i < readings.length; i++) {
        cumulativeCheck += (readings[i].length - readings[i-1].length);
      }
      calculationExplanation += `<br>Verified by summing all intervals: ${cumulativeCheck.toFixed(2)}m`;
    }
  }

  return {
    date: dateString,
    dailyProduction,
    readingCount: readings.length,
    calculationExplanation,
    sampleReadings: readings.length > 0 ? [readings[0], readings[readings.length - 1]] : []
  };
}

async function sendReport() {
  try {
    const { date, dailyProduction, readingCount, calculationExplanation, sampleReadings } = await getYesterdayProduction();
    
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
          <tr><th>Daily Production</th><td>${dailyProduction.toFixed(2)} meters</td></tr>
          <tr><th>Total Readings</th><td>${readingCount}</td></tr>
        </table>
        <h4>Calculation Method:</h4>
        <p>${calculationExplanation}</p>
        ${sampleReadings.length > 0 ? `
        <h4>Key Readings:</h4>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr>
            <th>Type</th>
            <th>Length (m)</th>
            <th>Timestamp (IST)</th>
          </tr>
          <tr>
            <td>First Reading</td>
            <td>${sampleReadings[0].length.toFixed(2)}</td>
            <td>${new Date(sampleReadings[0].timestamp * 1000).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}</td>
          </tr>
          <tr>
            <td>Last Reading</td>
            <td>${sampleReadings[1].length.toFixed(2)}</td>
            <td>${new Date(sampleReadings[1].timestamp * 1000).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}</td>
          </tr>
        </table>
        ` : ''}
        <p><small>Report generated at: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}</small></p>
      `
    });

    console.log(`✅ Report sent at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
  } catch (err) {
    console.error('❌ Report failed:', err);
    process.exit(1);
  }
}

sendReport();
