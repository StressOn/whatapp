// ======================
// 1. ENVIRONMENT CHECKS
// ======================
console.log("=== ENVIRONMENT VARIABLES ===");
console.log(Object.keys(process.env).filter(k => k.includes('FIREBASE') || k.includes('GMAIL')));

// Throw clear error if missing secrets
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ MISSING: FIREBASE_SERVICE_ACCOUNT");
  process.exit(1);
}
if (!process.env.GMAIL_APP_PASSWORD) {
  console.error("❌ MISSING: GMAIL_APP_PASSWORD");
  process.exit(1);
}

// ======================
// 2. FIREBASE SETUP
// ======================
let serviceAccount;
try {
  console.log("\n=== FIREBASE CONFIG ===");
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log("✅ Valid JSON:", {
    project_id: serviceAccount.project_id,
    client_email: serviceAccount.client_email
  });
} catch (err) {
  console.error("❌ Invalid Firebase JSON:", err.message);
  process.exit(1);
}

try {
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
  });
  console.log("🔥 Firebase initialized");
} catch (err) {
  console.error("❌ Firebase init failed:", err.message);
  process.exit(1);
}

// ======================
// 3. PRODUCTION REPORT FUNCTIONS
// ======================

// Helper to get yesterday's date in Firebase timestamp format
function getYesterdayTimestamps() {
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(now.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  return {
    start: Math.floor(yesterdayStart.getTime() / 1000),
    end: Math.floor(yesterdayEnd.getTime() / 1000)
  };
}

async function getYesterdayProduction() {
  try {
    const { start, end } = getYesterdayTimestamps();
    console.log(`\n📅 Fetching data from ${new Date(start * 1000)} to ${new Date(end * 1000)}`);

    const db = admin.database();
    const snapshot = await db.ref('Sensor/perday/readings')
      .orderByChild('timestamp')
      .startAt(start)
      .endAt(end)
      .once('value');

    const data = snapshot.val() || {};
    const readings = Object.values(data);
    
    console.log(`📊 Found ${readings.length} readings`);
    return readings;
    
  } catch (err) {
    console.error("❌ Failed to fetch production data:", err);
    process.exit(1);
  }
}

function generateReport(readings) {
  const totalLength = readings.reduce((sum, r) => sum + (r.length || 0), 0);
  const avgLength = readings.length ? (totalLength / readings.length).toFixed(2) : 0;
  
  return `
    <h1>Yesterday's Production Report</h1>
    <table border="1" cellpadding="5">
      <tr>
        <th>Metric</th>
        <th>Value</th>
      </tr>
      <tr>
        <td>Total Readings</td>
        <td>${readings.length}</td>
      </tr>
      <tr>
        <td>Total Length (meters)</td>
        <td>${totalLength.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Average Length (meters)</td>
        <td>${avgLength}</td>
      </tr>
    </table>
    <h3>Detailed Readings</h3>
    <pre>${JSON.stringify(readings, null, 2)}</pre>
  `;
}

// ======================
// 4. MAIN EXECUTION
// ======================
(async () => {
  try {
    const readings = await getYesterdayProduction();
    const reportHtml = generateReport(readings);
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Production Bot" <${process.env.SENDER_EMAIL}>`,
      to: process.env.BOSS_EMAIL,
      subject: `Production Report - ${new Date().toLocaleDateString()}`,
      html: reportHtml
    });

    console.log("✅ Report sent successfully");
  } catch (err) {
    console.error("❌ Script failed:", err);
    process.exit(1);
  }
})();
