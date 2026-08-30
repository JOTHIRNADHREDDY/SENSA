// Twilio notification integration placeholder
// Used for WhatsApp and SMS alerts

export async function sendWhatsAppNotification(env: any, toPhone: string, bodyText: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    console.warn("Twilio credentials not configured. Skipping WhatsApp notification.");
    return { success: false, error: "Twilio not configured" };
  }

  try {
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const formData = new URLSearchParams();
    
    // Twilio uses 'whatsapp:+1234567890' format
    const formattedTo = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;
    const formattedFrom = env.TWILIO_PHONE_NUMBER.startsWith('whatsapp:') ? env.TWILIO_PHONE_NUMBER : `whatsapp:${env.TWILIO_PHONE_NUMBER}`;
    
    formData.append("To", formattedTo);
    formData.append("From", formattedFrom);
    formData.append("Body", bodyText);

    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    if (!response.ok) {
      const err = await response.json() as any;
      throw new Error(`Twilio error: ${err.message}`);
    }

    const data = await response.json() as any;
    return { success: true, messageId: data.sid, status: data.status };
  } catch (e: any) {
    console.error("Failed to send WhatsApp:", e);
    return { success: false, error: e.message };
  }
}
