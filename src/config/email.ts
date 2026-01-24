import * as Brevo from '@getbrevo/brevo';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = process.env.EMAIL_FROM;

const client = new Brevo.TransactionalEmailsApi();
client.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY!);
(client as any)["timeout"] = 30000;

type BrevoEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string
};

export const sendMailTransporter = async (buildEmail: () => BrevoEmailPayload) => {
  try {
    const { to, subject, html, text } = buildEmail();

    const email = {
      sender: { name: "PPMS", email: ADMIN_EMAIL! },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    };

    const response = await client.sendTransacEmail(email);
    console.log("Mail sent");
  } catch (err) {
    console.error("Error sending email:", err);
    throw err;
  }
};

export default sendMailTransporter;