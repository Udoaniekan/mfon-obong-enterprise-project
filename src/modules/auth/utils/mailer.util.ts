import * as nodemailer from 'nodemailer';

export async function sendOTPEmail(to: string, otp: string) {
  // Configure your SMTP transport here
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject: 'OTP for Password Reset',
    text: `Your OTP for password reset is: ${otp}. It expires in 10 minutes.`,
  };

  await transporter.sendMail(mailOptions);
}
