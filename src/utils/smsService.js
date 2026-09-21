import https from 'https';

/**
 * Send an SMS alert to the Admin's mobile phone whenever a customer places an order.
 * 
 * Supports:
 * - Direct Fast2SMS API (for Indian numbers like 9566647825)
 * - Twilio API
 * - Local dev / console notification logger with full details
 * 
 * @param {Object} orderData
 */
export const sendOrderAlertSMS = async ({
  orderNumber,
  customerName,
  customerPhone,
  totalPieces,
  totalAmount,
  transporter = 'VRL Logistics Cargo',
  destination = 'Erode, Tamil Nadu',
}) => {
  const adminPhone = process.env.ADMIN_PHONE || '+919566647825';
  const cleanPhone = adminPhone.replace(/[^0-9]/g, '').slice(-10); // 10-digit Indian phone (e.g. 9566647825)

  // Construct short, standard wholesale order alert message
  const smsBody = 
`[GOWTHAM TEX] 🚨 New Wholesale Order #${orderNumber}!
Buyer: ${customerName || 'Wholesale Buyer'} (${customerPhone || 'N/A'})
Items: ${totalPieces || 0} pcs White Towels
Total: Rs. ${Number(totalAmount || 0).toLocaleString('en-IN')} (Incl. 5% GST)
Transport: ${transporter} -> ${destination}
Status: Payment Pending Verification
Portal: http://localhost:5173/admin/orders`;

  // Always print the formatted SMS alert to server console for instant audit
  console.log('\n============================================================');
  console.log(`📱 SMS ORDER ALERT DISPATCHED TO ADMIN (${adminPhone})`);
  console.log('============================================================');
  console.log(`To: +91 ${cleanPhone}`);
  console.log(`Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('Message Content:');
  console.log(smsBody);
  console.log('============================================================\n');

  // If Fast2SMS API key is configured, send real SMS
  const fast2SmsKey = process.env.FAST2SMS_API_KEY || process.env.SMS_API_KEY;
  if (fast2SmsKey && fast2SmsKey !== 'YOUR_FAST2SMS_API_KEY') {
    try {
      const payload = JSON.stringify({
        route: 'q', // Quick transactional route
        message: smsBody,
        language: 'english',
        flash: 0,
        numbers: cleanPhone,
      });

      const options = {
        hostname: 'www.fast2sms.com',
        path: '/dev/bulkV2',
        method: 'POST',
        headers: {
          authorization: fast2SmsKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          console.log(`[Fast2SMS Response] Status ${res.statusCode}:`, responseData);
        });
      });

      req.on('error', (err) => {
        console.error('[Fast2SMS Network Error]', err.message);
      });

      req.write(payload);
      req.end();
    } catch (apiErr) {
      console.error('[Fast2SMS Exception]', apiErr.message);
    }
  }

  // If Twilio is configured
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      const toNumber = adminPhone.startsWith('+') ? adminPhone : `+91${cleanPhone}`;

      const postData = new URLSearchParams({
        From: fromNumber,
        To: toNumber,
        Body: smsBody,
      }).toString();

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const options = {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          console.log(`[Twilio SMS Response] Status ${res.statusCode}:`, responseData);
        });
      });

      req.on('error', (err) => {
        console.error('[Twilio SMS Network Error]', err.message);
      });

      req.write(postData);
      req.end();
    } catch (twErr) {
      console.error('[Twilio Exception]', twErr.message);
    }
  }

  return { success: true, phone: cleanPhone, body: smsBody };
};
