// ======================
// 1. ENVIRONMENT CHECKS
// ======================
console.log("=== ENVIRONMENT VARIABLES ===");
console.log(Object.keys(process.env).filter(k => k.includes('FIREBASE') || k.includes('GMAIL')));

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
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
  });
  console.log("🔥 Firebase initialized");
} catch (err) {
  console.error("❌ Firebase init failed:", err);
  process.exit(1);
}

// ======================
// 3. PRODUCTION MONITOR
// ======================
async function getCurrentProduction() {
  const db = admin.database();
  const snapshot = await db.ref('Sensor/perday/count').once('value');
  return {
    count: snapshot.val() || 0,
    timestamp: new Date().toISOString()
  };
}

async function sendAlert(production) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: `"Production Monitor" <${process.env.SENDER_EMAIL}>`,
    to: process.env.BOSS_EMAIL,
    subject: `🚨 Production Alert - ${new Date().toLocaleTimeString()}`,
    html: `
      <h1>Current Production Status</h1>
      <p><strong>Count:</strong> ${production.count}</p>
      <p><strong>Last Updated:</strong> ${production.timestamp}</p>
    `
  });
}

// ======================
// 4. MONITORING LOOP
// ======================
(async () => {
  try {
    // Run every 60 seconds
    setInterval(async () => {
      const production = await getCurrentProduction();
      console.log(`🔄 [${new Date().toISOString()}] Current count: ${production.count}`);
      
      await sendAlert(production);
      console.log("📧 Alert sent");
    }, 60000); // 60,000ms = 1 minute

    // Initial run
    const initialProduction = await getCurrentProduction();
    console.log("⏳ Starting monitor. Initial count:", initialProduction.count);
    
  } catch (err) {
    console.error("❌ Monitor failed:", err);
    process.exit(1);
  }
})();
