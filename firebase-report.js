try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ Invalid Firebase JSON:", err.message);
  console.log("Actual content received:", process.env.FIREBASE_SERVICE_ACCOUNT);
  process.exit(1);
}
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { format, subDays } = require('date-fns');

// 1. Firebase Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

// 2. Gmail Email Sender
async function sendGmail(html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD // NOT your regular password
    }
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.BOSS_EMAIL,
    subject: `Production Report - ${format(subDays(new Date(), 1), 'yyyy-MM-dd')}`,
    html
  });
}

// 3. Report Generator
async function main() {
  try {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const snapshot = await admin.database().ref('production')
      .orderByChild('date')
      .equalTo(yesterday)
      .once('value');

    const data = snapshot.val() || {};
    
    const html = `
      <h1>Production Report (${yesterday})</h1>
      <table border="1">
        <tr>
          <th>Machine</th><th>Units</th><th>Defects</th>
        </tr>
        ${Object.values(data).map(item => `
          <tr>
            <td>${item.machine || 'N/A'}</td>
            <td>${item.units || 0}</td>
            <td>${item.defects || 0}</td>
          </tr>
        `).join('')}
      </table>
    `;

    await sendGmail(html);
    console.log('Email sent via Gmail!');
    
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

main();
