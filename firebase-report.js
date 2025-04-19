// ======================
// 1. ENVIRONMENT CHECKS
// ======================
console.log("=== ENVIRONMENT VARIABLES ===");
console.log(Object.keys(process.env).filter(k => k.includes('FIREBASE') || k.includes('GMAIL')));

// Throw clear error if missing secrets
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ MISSING: FIREBASE_SERVICE_ACCOUNT");
  console.log("Available env vars:", Object.keys(process.env));
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
  console.log("First 50 chars received:", process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 50));
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
// 3. DATA FETCHING
// ======================
async function fetchData() {
  try {
    console.log("\n=== FETCHING DATA ===");
    const db = admin.database();
    const snapshot = await db.ref('production').once('value');
    const data = snapshot.val();
    
    console.log(`📊 Records found: ${data ? Object.keys(data).length : 0}`);
    return data || {};
  } catch (err) {
    console.error("❌ Data fetch failed:", err.message);
    process.exit(1);
  }
}

// ======================
// 4. EMAIL SENDING
// ======================
async function sendEmail(html) {
  try {
    const nodemailer = require('nodemailer');
    console.log("\n=== EMAIL CONFIG ===");
    console.log("From:", process.env.SENDER_EMAIL);
    console.log("To:", process.env.BOSS_EMAIL);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: process.env.BOSS_EMAIL,
      subject: `Production Report - ${new Date().toLocaleDateString()}`,
      html
    });
    console.log("📧 Email sent successfully");
  } catch (err) {
    console.error("❌ Email failed:", err.message);
    process.exit(1);
  }
}

// ======================
// 5. MAIN EXECUTION
// ======================
(async () => {
  try {
    const data = await fetchData();
    
    const html = `
      <h1>Production Report</h1>
      <pre>${JSON.stringify(data, null, 2)}</pre>
      <p>Generated at: ${new Date()}</p>
    `;

    await sendEmail(html);
    console.log("✅ Script completed successfully");
  } catch (err) {
    console.error("❌ Script crashed:", err);
    process.exit(1);
  }
})();
