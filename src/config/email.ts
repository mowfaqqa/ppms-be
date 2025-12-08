import nodemailer from 'nodemailer';

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_USER,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export default transporter;