const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// ======================
// 1. FIREBASE SETUP (UNCHANGED)
// ======================
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

// ======================
// 2. DATA COLLECTION (MINIMAL CHANGE)
// ======================
async function getProductionData() {
  const snapshot = await admin.database().ref('Sensor/perday').once('value');
  return {
    count: snapshot.child('count').val() || 0,
    timestamp: new Date((snapshot.child('timestamp').val() || 0) * 1000).toLocaleString()
  };
}

// ======================
// 3. EMAIL SENDING (UNCHANGED FROM WORKING VERSION)
// ======================
async function sendReport() {
  try {
    const { count, timestamp } = await getProductionData();
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Production Alert" <${process.env.SENDER_EMAIL}>`,
      to: process.env.BOSS_EMAIL,
      subject: `Production Update: ${count}`,
      text: `Current count: ${count}\nLast Updated: ${timestamp}`
    });

    console.log(`✅ Email sent | Count: ${count}`);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

// ======================
// 4. EXECUTION (UNCHANGED)
// ======================
sendReport();
